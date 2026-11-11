import { z } from "zod";
import { db } from "../db";
import { getSecret } from "../crypto/secrets";
import { OfflineRulesProvider } from "./offline";
import { OpenAiCompatibleProvider } from "./openaiCompatible";
import { AiError, type AiProvider } from "./types";

export const DEEPSEEK_BASE_URL = "https://api.deepseek.com";

export const aiSettingsSchema = z.object({
  provider: z.enum(["offline", "deepseek", "openai_compatible"]),
  baseUrl: z.string().url().max(300),
  replyModel: z.string().min(1).max(120),
  thinking: z.enum(["disabled", "enabled"]),
  temperature: z.number().min(0).max(2).nullable(),
  topP: z.number().min(0).max(1).nullable(),
  maxOutputTokens: z.number().int().min(64).max(8000),
  timeoutMs: z.number().int().min(3000).max(120000),
  /** USD per 1M tokens; used for the daily budget estimate. Edit to match your provider's current price page. */
  pricing: z.record(z.string(), z.object({ inputPerM: z.number().min(0), outputPerM: z.number().min(0) })),
  /** Model id that last passed a live connection test. Live drafting requires replyModel === verifiedModel. */
  verifiedModel: z.string().nullable(),
  alternate: z.object({
    enabled: z.boolean(),
    provider: z.enum(["deepseek", "openai_compatible"]),
    baseUrl: z.string().url().max(300),
    model: z.string().max(120),
    verifiedModel: z.string().nullable(),
  }),
});
export type AiSettings = z.infer<typeof aiSettingsSchema>;

export const DEFAULT_AI: AiSettings = {
  provider: "offline",
  baseUrl: DEEPSEEK_BASE_URL,
  // Pre-filled from DeepSeek docs on 2026-11-11; must still pass the connection test before use.
  replyModel: "deepseek-flash",
  thinking: "disabled",
  temperature: 0.7,
  topP: null,
  maxOutputTokens: 600,
  timeoutMs: 30000,
  pricing: {
    "deepseek-flash": { inputPerM: 0.15, outputPerM: 0.6 },
    "deepseek-v4-pro": { inputPerM: 0.66, outputPerM: 1.98 },
  },
  verifiedModel: null,
  alternate: { enabled: false, provider: "deepseek", baseUrl: DEEPSEEK_BASE_URL, model: "deepseek-v4-pro", verifiedModel: null },
};

export async function getAiSettings(): Promise<AiSettings> {
  const row = await db().integrationConfig.findUnique({ where: { id: "ai" } });
  const parsed = aiSettingsSchema.safeParse({ ...DEFAULT_AI, ...((row?.settings as object) ?? {}) });
  return parsed.success ? parsed.data : DEFAULT_AI;
}

export function buildProvider(kind: "deepseek" | "openai_compatible", baseUrl: string, key: string): AiProvider {
  if (kind === "deepseek") return new OpenAiCompatibleProvider("deepseek", "DeepSeek", DEEPSEEK_BASE_URL, key);
  return new OpenAiCompatibleProvider("openai_compatible", "OpenAI-compatible", baseUrl, key);
}

/** Resolve the provider used for reply drafting. Fails clearly instead of silently falling back. */
export async function resolveReplyProvider(): Promise<{ provider: AiProvider; model: string; settings: AiSettings }> {
  const settings = await getAiSettings();
  if (settings.provider === "offline") return { provider: new OfflineRulesProvider(consumeSimulatedAiFailure), model: "offline-rules-v1", settings };
  const key = await getSecret("ai.primary");
  if (!key) throw new AiError("No AI provider key saved. Add one under Integrations → AI.", "auth");
  if (settings.verifiedModel !== settings.replyModel)
    throw new AiError(`Model "${settings.replyModel}" has not passed a connection test. Run the test under Integrations → AI.`, "unavailable_model");
  return { provider: buildProvider(settings.provider, settings.baseUrl, key), model: settings.replyModel, settings };
}

/** Atomically consume one injected AI failure (Simulator → "Next AI call fails"). */
async function consumeSimulatedAiFailure() {
  const r = await db().simulatorState.updateMany({ where: { id: "sim", aiFailNext: { gt: 0 } }, data: { aiFailNext: { decrement: 1 } } });
  return r.count > 0;
}

export function estimateCostMicros(settings: AiSettings, model: string, tokensIn: number, tokensOut: number) {
  const p = settings.pricing[model];
  if (!p) return 0;
  return Math.round(tokensIn * p.inputPerM + tokensOut * p.outputPerM);
}

export function todayKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

export async function spentTodayMicros() {
  const r = await db().aiUsage.aggregate({ where: { day: todayKey() }, _sum: { costMicros: true } });
  return r._sum.costMicros ?? 0;
}
