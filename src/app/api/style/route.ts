import { z } from "zod";
import { api } from "@/server/http";
import { db } from "@/server/db";
import { styleSchema, DEFAULT_STYLE } from "@/server/ai/style";
import { requireOwner, assertAccountAccess, HttpError } from "@/server/auth/access";
import { audit } from "@/server/audit";
import { resolveReplyProvider, estimateCostMicros, spentTodayMicros, todayKey } from "@/server/ai/config";
import { runReplyPipeline } from "@/server/ai/pipeline";
import { buildReplyMessages, PROMPT_VERSION, type ReplyContext } from "@/server/ai/prompt";
import { getAutomation } from "@/server/automation/settings";
import { applyDisclosure } from "@/server/services/drafting";

async function accountIdFor(req: { nextUrl: URL }) {
  const id = req.nextUrl.searchParams.get("account");
  const acct = id ? await db().creatorAccount.findUnique({ where: { id } }) : await db().creatorAccount.findFirst({ orderBy: { createdAt: "asc" } });
  if (!acct) throw new HttpError(404, "No creator account yet");
  return acct;
}

export const GET = api({ auth: "user" }, async ({ user, req }) => {
  const acct = await accountIdFor(req);
  await assertAccountAccess(user, acct.id);
  const versions = await db().styleProfile.findMany({ where: { accountId: acct.id }, orderBy: { version: "desc" }, take: 30 });
  const active = versions.find((v) => v.active);
  const parsed = active ? styleSchema.safeParse(active.data) : null;
  const exp = await db().integrationConfig.findUnique({ where: { id: "experiment" } });
  return {
    account: { id: acct.id, name: acct.displayName, disclosureText: acct.disclosureText },
    active: active ? { version: active.version, data: parsed?.success ? parsed.data : DEFAULT_STYLE } : { version: null, data: DEFAULT_STYLE },
    versions: versions.map((v) => ({ version: v.version, active: v.active, changeNote: v.changeNote, createdAt: v.createdAt })),
    experiment: exp ? { enabled: exp.enabled, ...(exp.settings as object) } : null,
    promptVersion: PROMPT_VERSION,
  };
});

const post = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), accountId: z.string(), data: styleSchema, changeNote: z.string().max(200), disclosureText: z.string().min(10).max(300) }),
  z.object({ action: z.literal("activate"), accountId: z.string(), version: z.number().int() }),
  z.object({ action: z.literal("preview"), accountId: z.string(), data: styleSchema, conversation: z.array(z.object({ direction: z.enum(["INBOUND", "OUTBOUND"]), body: z.string().min(1).max(1000) })).min(1).max(12), showPrompt: z.boolean().optional() }),
  z.object({ action: z.literal("experiment"), enabled: z.boolean(), key: z.string().min(1).max(40), variants: z.record(z.string().max(10), z.number().int().min(1)) }),
]);

export const POST = api({ auth: "user", body: post }, async ({ user, body }) => {
  if (body.action === "preview") {
    await assertAccountAccess(user, body.accountId);
    const auto = await getAutomation();
    if ((await spentTodayMicros()) >= auto.dailyAiBudgetMicros) throw new HttpError(409, "Daily AI budget reached");
    const { provider, model, settings } = await resolveReplyProvider();
    const catalog = (await db().catalogItem.findMany({ where: { accountId: body.accountId, active: true } })).map((c) => ({ id: c.id, title: c.title, description: c.description, priceCents: c.priceCents, priceConfirmed: c.priceConfirmed, alreadyPurchased: false }));
    const ctx: ReplyContext = { style: body.data, facts: body.data.publicFacts, catalog, summary: null, customerPreferences: [], triageNotes: [], isFirstAiMessage: true, messages: body.conversation.map((m, i) => ({ ...m, at: `t${i}` })) };
    const r = await runReplyPipeline(provider, model, settings, ctx, { maxRewrites: auto.rules.ai.maxRewrites, recentOutbound: body.conversation.filter((m) => m.direction === "OUTBOUND").map((m) => m.body) });
    const cost = estimateCostMicros(settings, r.model, r.tokensIn, r.tokensOut);
    if (r.calls) await db().aiUsage.create({ data: { day: todayKey(), provider: provider.id, model: r.model, purpose: "preview", tokensIn: r.tokensIn, tokensOut: r.tokensOut, costMicros: cost, latencyMs: r.latencyMs, ok: !r.error } });
    const acct = await db().creatorAccount.findUniqueOrThrow({ where: { id: body.accountId } });
    return {
      provider: provider.label,
      /** true when the built-in offline rules wrote this (no AI model connected): the UI labels it as a sample. */
      isSample: !!provider.isOffline,
      model: r.model,
      output: r.output,
      finalText: r.output?.reply ? applyDisclosure(r.output.reply, { isFirstAiMessage: true, mode: auto.rules.disclosure.mode, disclosureText: acct.disclosureText, tag: auto.rules.disclosure.tag }) : null,
      issues: r.issues,
      error: r.error,
      rewriteCount: r.rewriteCount,
      latencyMs: r.latencyMs,
      tokens: { in: r.tokensIn, out: r.tokensOut },
      costMicros: cost,
      applied: { tone: body.data.tone, formality: body.data.formality, expressiveness: body.data.expressiveness, emoji: body.data.emoji, length: body.data.replyLength, lowercase: body.data.lowercase, contractions: body.data.contractions, casualPunctuation: body.data.casualPunctuation, language: body.data.language, examplesUsed: Math.min(4, body.data.goodExamples.length), disclosure: auto.rules.disclosure },
      prompt: body.showPrompt ? buildReplyMessages(ctx) : undefined,
    };
  }
  requireOwner(user);
  if (body.action === "save") {
    const last = await db().styleProfile.findFirst({ where: { accountId: body.accountId }, orderBy: { version: "desc" } });
    const version = (last?.version ?? 0) + 1;
    await db().$transaction([
      db().styleProfile.updateMany({ where: { accountId: body.accountId }, data: { active: false } }),
      db().styleProfile.create({ data: { accountId: body.accountId, version, active: true, data: body.data, changeNote: body.changeNote, createdById: user.id } }),
      db().creatorAccount.update({ where: { id: body.accountId }, data: { disclosureText: body.disclosureText } }),
    ]);
    await audit("style.saved", { actorId: user.id, target: body.accountId, details: { version } });
    return { version };
  }
  if (body.action === "activate") {
    await db().styleProfile.findUniqueOrThrow({ where: { accountId_version: { accountId: body.accountId, version: body.version } } });
    await db().$transaction([
      db().styleProfile.updateMany({ where: { accountId: body.accountId }, data: { active: false } }),
      db().styleProfile.update({ where: { accountId_version: { accountId: body.accountId, version: body.version } }, data: { active: true } }),
    ]);
    await audit("style.rollback", { actorId: user.id, target: body.accountId, details: { version: body.version } });
    return { ok: true };
  }
  const settings = { enabled: body.enabled, key: body.key, variants: body.variants, startedAt: body.enabled ? new Date().toISOString() : null };
  await db().integrationConfig.upsert({ where: { id: "experiment" }, create: { id: "experiment", provider: "internal", enabled: body.enabled, settings }, update: { enabled: body.enabled, settings } });
  await audit("experiment.update", { actorId: user.id, details: settings });
  return { ok: true };
});
