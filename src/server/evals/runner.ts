import { randomBytes } from "node:crypto";
import { db, Prisma } from "../db";
import { resolveReplyProvider, getAiSettings, buildProvider, estimateCostMicros, todayKey, spentTodayMicros } from "../ai/config";
import { getSecret } from "../crypto/secrets";
import { runReplyPipeline } from "../ai/pipeline";
import { PROMPT_VERSION, type ReplyContext } from "../ai/prompt";
import { activeStyle } from "../services/drafting";
import { getAutomation } from "../automation/settings";
import { triage } from "../scoring/triage";
import type { EvalExpected } from "./cases";
import type { AiProvider } from "../ai/types";
import { HttpError } from "../auth/access";

/** Create a run for "primary" or "alternate" model. Blind label is random so reviewers can't infer the model. */
export async function createEvalRun(slot: "primary" | "alternate", label?: string) {
  const s = await getAiSettings();
  let providerId: string, model: string;
  if (slot === "primary") {
    const r = await resolveReplyProvider();
    providerId = r.provider.id;
    model = r.model;
  } else {
    if (!s.alternate.enabled) throw new HttpError(400, "Enable and test an alternate model first");
    if (s.alternate.verifiedModel !== s.alternate.model) throw new HttpError(400, "Alternate model has not passed a connection test");
    providerId = s.alternate.provider;
    model = s.alternate.model;
  }
  return db().evalRun.create({ data: { label: label ?? `${slot} ${new Date().toISOString().slice(0, 16)}`, provider: providerId, model, promptVersion: PROMPT_VERSION } });
}

async function providerFor(run: { provider: string; model: string }): Promise<{ provider: AiProvider; settings: Awaited<ReturnType<typeof getAiSettings>> }> {
  const s = await getAiSettings();
  const primary = await resolveReplyProvider().catch(() => null);
  if (primary && primary.provider.id === run.provider && primary.model === run.model) return { provider: primary.provider, settings: s };
  const key = await getSecret("ai.alternate");
  if (!key || (run.provider !== "deepseek" && run.provider !== "openai_compatible")) throw new Error("Provider for this run is no longer configured");
  return { provider: buildProvider(run.provider, s.alternate.baseUrl, key), settings: s };
}

export function autoCheck(expected: EvalExpected, out: { action: string; reply: string } | null, triageHandoff: boolean) {
  const reply = (out?.reply ?? "").toLowerCase();
  const action = triageHandoff ? "HANDOFF" : out?.action ?? "ERROR";
  return {
    actionOk: expected.actions.includes(action as any),
    action,
    forbidden: (expected.mustNotMention ?? []).filter((m) => reply.includes(m.toLowerCase())),
    missing: (expected.mustMention ?? []).filter((m) => !reply.includes(m.toLowerCase())),
    length: reply.length,
  };
}

/** Runs every case once for a run. Deterministic triage runs first, exactly like production. */
export async function executeEvalRun(runId: string) {
  const run = await db().evalRun.findUniqueOrThrow({ where: { id: runId } });
  const auto = await getAutomation();
  const { provider, settings } = await providerFor(run);
  const acct = await db().creatorAccount.findFirst({ where: { isSimulated: true } });
  const { style, version } = acct ? await activeStyle(db(), acct.id) : await activeStyle(db(), "none");
  const catalogRows = acct ? await db().catalogItem.findMany({ where: { accountId: acct.id, active: true } }) : [];
  const cases = await db().evalCase.findMany({ orderBy: { key: "asc" } });
  const blind = randomBytes(2).toString("hex").toUpperCase();
  await db().evalRun.update({ where: { id: runId }, data: { styleVersion: version } });
  for (const c of cases) {
    if ((await spentTodayMicros()) >= auto.dailyAiBudgetMicros) {
      await db().evalRun.update({ where: { id: runId }, data: { status: "stopped: budget", finishedAt: new Date() } });
      return;
    }
    const expected = c.expected as unknown as EvalExpected;
    const transcript = c.transcript as { direction: "INBOUND" | "OUTBOUND"; body: string }[];
    const lastIn = [...transcript].reverse().find((m) => m.direction === "INBOUND")?.body ?? "";
    const triageHandoff = triage(lastIn).some((h) => h.handoff);
    const catalog = catalogRows.map((i) => ({ id: i.id, title: i.title, description: i.description, priceCents: i.priceCents, priceConfirmed: i.priceConfirmed, alreadyPurchased: (expected.purchased ?? []).includes(i.title) }));
    const ctx: ReplyContext = { style, facts: style.publicFacts, catalog, summary: null, customerPreferences: [], triageNotes: [], isFirstAiMessage: false, messages: transcript.map((m, i) => ({ ...m, at: `t${i}` })) };
    let data: Prisma.EvalResultUncheckedCreateInput;
    if (triageHandoff) {
      data = { runId, caseId: c.id, blindLabel: blind, action: "HANDOFF", body: "", autoChecks: autoCheck(expected, null, true) };
    } else {
      const r = await runReplyPipeline(provider, run.model, settings, ctx, { maxRewrites: auto.rules.ai.maxRewrites, recentOutbound: transcript.filter((m) => m.direction === "OUTBOUND").map((m) => m.body) });
      const cost = estimateCostMicros(settings, r.model, r.tokensIn, r.tokensOut);
      if (r.calls) await db().aiUsage.create({ data: { day: todayKey(), provider: provider.id, model: r.model, purpose: "eval", tokensIn: r.tokensIn, tokensOut: r.tokensOut, costMicros: cost, latencyMs: r.latencyMs, ok: !r.error } });
      data = {
        runId,
        caseId: c.id,
        blindLabel: blind,
        action: r.output?.action ?? null,
        body: r.output?.reply ?? null,
        error: r.error?.message ?? null,
        autoChecks: { ...autoCheck(expected, r.output, false), validator: r.issues.map((i) => i.code), rewrites: r.rewriteCount } as Prisma.InputJsonValue,
        latencyMs: r.latencyMs,
        tokensIn: r.tokensIn,
        tokensOut: r.tokensOut,
        costMicros: cost,
      };
    }
    await db().evalResult.upsert({ where: { runId_caseId: { runId, caseId: c.id } }, create: data, update: data });
  }
  await db().evalRun.update({ where: { id: runId }, data: { status: "done", finishedAt: new Date() } });
}

export async function evalSummary(runId: string) {
  const results = await db().evalResult.findMany({ where: { runId }, include: { case: true } });
  const n = results.length;
  const checks = results.map((r) => r.autoChecks as any);
  return {
    cases: n,
    actionAccuracy: n ? checks.filter((c) => c.actionOk).length / n : null,
    forbiddenHits: checks.filter((c) => c.forbidden?.length).length,
    errors: results.filter((r) => r.error).length,
    avgLatencyMs: n ? Math.round(results.reduce((s, r) => s + r.latencyMs, 0) / n) : 0,
    tokens: results.reduce((s, r) => s + r.tokensIn + r.tokensOut, 0),
    costMicros: results.reduce((s, r) => s + r.costMicros, 0),
    reviewed: results.filter((r) => r.reviewerScore != null).length,
    avgReviewerScore: results.filter((r) => r.reviewerScore != null).length ? results.reduce((s, r) => s + (r.reviewerScore ?? 0), 0) / results.filter((r) => r.reviewerScore != null).length : null,
    preferredCount: results.filter((r) => r.preferred).length,
    byCategory: Object.entries(
      results.reduce<Record<string, { n: number; ok: number }>>((acc, r) => {
        const k = r.case.category;
        acc[k] ??= { n: 0, ok: 0 };
        acc[k].n++;
        if ((r.autoChecks as any).actionOk) acc[k].ok++;
        return acc;
      }, {}),
    ).map(([category, v]) => ({ category, ...v })),
  };
}
