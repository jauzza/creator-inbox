import { db, Prisma, type Tx } from "../db";
import { getAutomation } from "../automation/settings";
import { planReply } from "../automation/timing";
import { resolveReplyProvider, estimateCostMicros, spentTodayMicros, todayKey, type AiSettings } from "../ai/config";
import { runReplyPipeline, type PipelineResult } from "../ai/pipeline";
import { PROMPT_VERSION, type CatalogFact, type ReplyContext } from "../ai/prompt";
import { DEFAULT_STYLE, styleSchema, type Style } from "../ai/style";
import { hasBlocking } from "../ai/validator";
import { AiError } from "../ai/types";
import { triage } from "../scoring/triage";
import { enqueue, lockConversation } from "../queue/jobs";
import { notify } from "../notify/notify";
import { createHandoff } from "./handoffs";
import { loadConv, policyFor } from "./shared";
import { customerLabel } from "./ingest";
import { variantFor, styleVersionForVariant } from "./experiments";
import { log } from "../audit";

export async function activeStyle(client: Tx, accountId: string, version?: number | null): Promise<{ style: Style; version: number | null }> {
  const row = version
    ? await client.styleProfile.findUnique({ where: { accountId_version: { accountId, version } } })
    : await client.styleProfile.findFirst({ where: { accountId, active: true }, orderBy: { version: "desc" } });
  if (!row) return { style: DEFAULT_STYLE, version: null };
  const p = styleSchema.safeParse(row.data);
  return { style: p.success ? p.data : DEFAULT_STYLE, version: row.version };
}

/** Build the bounded, provenance-tracked context for one conversation. No full history by default. */
export async function buildContext(client: Tx, conversationId: string, maxMessages: number) {
  const conv = await client.conversation.findUniqueOrThrow({ where: { id: conversationId }, include: { customer: true } });
  const msgs = (await client.message.findMany({ where: { conversationId }, orderBy: { sentAt: "desc" }, take: maxMessages })).reverse();
  const auto = await getAutomation(client);
  const declinedSince = new Date(Date.now() - auto.rules.offers.declineCooldownDays * 86400000);
  const declinedTitles = (
    await client.offer.findMany({ where: { customerId: conv.customerId, status: "DECLINED", createdAt: { gte: declinedSince } }, include: { catalogItem: { select: { title: true } } } })
  ).map((o) => o.catalogItem.title);
  const { style, version } = await activeStyle(client, conv.accountId, await styleVersionForVariant(client, conv.customer.experimentVariant));
  const catalogRows = await client.catalogItem.findMany({ where: { accountId: conv.accountId, active: true }, take: 25 });
  const purchased = new Set(
    (await client.purchase.findMany({ where: { customerId: conv.customerId, verified: true, catalogItemId: { not: null } }, select: { catalogItemId: true } })).map((p) => p.catalogItemId),
  );
  const catalog: CatalogFact[] = catalogRows.map((c) => ({
    id: c.id,
    title: c.title,
    description: c.description,
    priceCents: c.priceCents,
    priceConfirmed: c.priceConfirmed,
    alreadyPurchased: purchased.has(c.id),
  }));
  const prefs = Array.isArray(conv.customer.preferences) ? (conv.customer.preferences as any[]).map((p) => String(p?.value ?? "")).filter(Boolean) : [];
  const priorAi = await client.message.count({ where: { conversationId, origin: { in: ["AI_AUTO", "AI_APPROVED"] } } });
  const latestInbound = [...msgs].reverse().find((m) => m.direction === "INBOUND");
  const notes = latestInbound && triage(latestInbound.body).some((h) => h.category === "ai_question") ? ["Customer asked about automation: answer honestly."] : [];
  const ctx: ReplyContext = {
    style,
    facts: style.publicFacts,
    catalog,
    summary: conv.summary,
    customerPreferences: prefs,
    messages: msgs.map((m) => ({ direction: m.direction, body: m.body, at: relTime(m.sentAt), hoursAgo: (Date.now() - m.sentAt.getTime()) / 3600000 })),
    triageNotes: notes,
    isFirstAiMessage: priorAi === 0,
    declinedTitles,
    doNotContact: conv.customer.doNotContact,
    offersSuppressed: !!conv.customer.suppressedUntil && conv.customer.suppressedUntil > new Date(),
    offerCooldownHours: auto.rules.offers.offerCooldownHours,
  };
  return { ctx, styleVersion: version, conv, msgs, recentOutbound: msgs.filter((m) => m.direction === "OUTBOUND").map((m) => m.body) };
}

function relTime(d: Date) {
  const m = Math.round((Date.now() - d.getTime()) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
}

/** Store what the AI chose to remember (short, service-relevant facts) on the subscriber, deduplicated. */
async function rememberFacts(tx: Tx, customerId: string, facts: string[]) {
  const clean = facts.map((f) => f.trim().slice(0, 80)).filter((f) => f.length >= 3 && !/\b(password|card|address|phone|ssn|bank)\b/i.test(f));
  if (!clean.length) return;
  const c = await tx.customer.findUniqueOrThrow({ where: { id: customerId }, select: { preferences: true } });
  const prefs = Array.isArray(c.preferences) ? (c.preferences as { value: string; source: string; at?: string }[]) : [];
  const have = new Set(prefs.map((p) => p.value.toLowerCase()));
  const add = clean.filter((f) => !have.has(f.toLowerCase())).map((value) => ({ value, source: "remembered by AI", at: new Date().toISOString() }));
  if (add.length) await tx.customer.update({ where: { id: customerId }, data: { preferences: [...prefs, ...add].slice(-12) } });
}

export function applyDisclosure(body: string, opts: { isFirstAiMessage: boolean; mode: "first_ai_message" | "every_ai_message"; disclosureText: string; tag: string }) {
  let out = body.trim();
  if (opts.mode === "every_ai_message" || opts.isFirstAiMessage) out += `\n\n${opts.disclosureText}`;
  if (opts.tag && !out.includes(opts.tag)) out += ` ${opts.tag}`;
  return out;
}

async function recordUsage(settings: AiSettings, providerId: string, r: PipelineResult, purpose: string) {
  const cost = estimateCostMicros(settings, r.model, r.tokensIn, r.tokensOut);
  if (r.calls > 0)
    await db().aiUsage.create({
      data: { day: todayKey(), provider: providerId, model: r.model, purpose, tokensIn: r.tokensIn, tokensOut: r.tokensOut, costMicros: cost, latencyMs: r.latencyMs, ok: !r.error },
    });
  return cost;
}

/** Worker handler for `generate_reply`. Model call happens OUTSIDE any transaction; the result is applied only if the conversation version is unchanged. */
export async function generateReply(conversationId: string): Promise<{ outcome: string }> {
  const automation = await getAutomation();
  const conv0 = await loadConv(db(), conversationId);
  const policy = policyFor(conv0, automation);
  if (!policy.aiMayDraft) return { outcome: `skipped: ${policy.reasons.join("; ")}` };
  if (!conv0.firstUnansweredAt) return { outcome: "skipped: nothing unanswered" };
  const version = conv0.version;

  const spent = await spentTodayMicros();
  if (spent >= automation.dailyAiBudgetMicros) {
    await db().$transaction((tx) =>
      createHandoff(tx, { conversationId, category: "budget", priority: 60, evidence: "Daily AI budget reached", rules: automation.rules, pause: false, customerLabel: customerLabel(conv0.customerId) }),
    );
    await db().$transaction((tx) =>
      notify(tx, { kind: "budget", title: "Today's AI spending limit was reached", body: "New drafts are paused until tomorrow. You can raise the limit in Settings → Automation.", link: "/settings/automation", dedupeKey: "budget", cooldownMin: 360 }),
    );
    return { outcome: "budget_exceeded" };
  }

  let resolved;
  try {
    resolved = await resolveReplyProvider();
  } catch (e) {
    const msg = e instanceof AiError ? e.message : String(e);
    await db().$transaction(async (tx) => {
      await lockConversation(tx, conversationId);
      await tx.draft.create({
        data: { conversationId, status: "HANDOFF", nextAction: "HANDOFF", body: "", originalBody: "", explanation: `AI unavailable: ${msg}`, intendedMode: "draft", basedOnVersion: version, model: "none", promptVersion: PROMPT_VERSION },
      });
      await createHandoff(tx, { conversationId, category: "ai_failure", priority: 50, evidence: msg.slice(0, 120), rules: automation.rules, pause: false, customerLabel: customerLabel(conv0.customerId) });
    });
    return { outcome: "ai_unavailable" };
  }

  const { ctx, styleVersion, recentOutbound, msgs } = await buildContext(db(), conversationId, automation.rules.ai.contextMessages);
  const result = await runReplyPipeline(resolved.provider, resolved.model, resolved.settings, ctx, { maxRewrites: automation.rules.ai.maxRewrites, recentOutbound });
  const cost = await recordUsage(resolved.settings, resolved.provider.id, result, "reply");
  const latestInbound = [...msgs].reverse().find((m) => m.direction === "INBOUND");

  return db().$transaction(
    async (tx) => {
      await lockConversation(tx, conversationId);
      const conv = await loadConv(tx, conversationId);
      if (conv.version !== version) return { outcome: "discarded: conversation changed during generation" };
      const auto = await getAutomation(tx);
      const pol = policyFor(conv, auto);
      const base = {
        conversationId,
        basedOnVersion: version,
        basedOnMessageId: latestInbound?.id,
        model: result.model,
        promptVersion: PROMPT_VERSION,
        styleVersion,
        rewriteCount: result.rewriteCount,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        costMicros: cost,
        latencyMs: result.latencyMs,
        validatorIssues: result.issues as unknown as Prisma.InputJsonValue,
        variant: conv.customer.experimentVariant ?? (await variantFor(tx, conv.customerId)),
      };
      const label = customerLabel(conv.customerId);

      if (result.error || !result.output) {
        const why = result.error?.message ?? "No output";
        await tx.draft.create({ data: { ...base, status: "HANDOFF", nextAction: "HANDOFF", body: "", originalBody: "", explanation: `AI failed: ${why}`, intendedMode: "draft" } });
        await createHandoff(tx, { conversationId, category: "ai_failure", priority: 50, evidence: why.slice(0, 120), rules: auto.rules, pause: false, customerLabel: label });
        return { outcome: "ai_failed" };
      }
      const out = result.output;
      if (out.action === "HANDOFF" || hasBlocking(result.issues)) {
        const reason = out.action === "HANDOFF" ? out.handoff_reason || "Model requested a human" : `Validator: ${result.issues.filter((i) => i.severity === "block").map((i) => i.code).join(", ")}`;
        await tx.draft.create({
          data: { ...base, status: "HANDOFF", nextAction: "HANDOFF", body: out.reply, originalBody: out.reply, explanation: `${out.explanation} (${reason})`.trim(), intendedMode: "draft" },
        });
        await createHandoff(tx, {
          conversationId,
          category: out.action === "HANDOFF" ? "model_handoff" : "ai_failure",
          priority: 55,
          evidence: reason.slice(0, 120),
          rules: auto.rules,
          pause: out.action === "HANDOFF" ? undefined : false,
          customerLabel: label,
        });
        return { outcome: out.action === "HANDOFF" ? "model_handoff" : "validator_blocked" };
      }
      if (out.action === "WAIT") {
        await tx.draft.create({ data: { ...base, status: "PROPOSED", nextAction: "WAIT", body: "", originalBody: "", explanation: out.explanation || "No reply needed", intendedMode: "draft" } });
        return { outcome: "wait" };
      }

      const body = applyDisclosure(out.reply, {
        isFirstAiMessage: ctx.isFirstAiMessage,
        mode: auto.rules.disclosure.mode,
        disclosureText: conv.account.disclosureText,
        tag: auto.rules.disclosure.tag,
      });
      const warnings = result.issues.filter((i) => i.severity === "warn");
      const canAuto = pol.aiMayAutoSend && pol.sendsAllowed && warnings.length === 0;
      let scheduledFor: Date | null = null;
      let autoNote = "";
      if (canAuto) {
        const hourAgo = new Date(Date.now() - 3600000);
        const dayAgo = new Date(Date.now() - 86400000);
        const [sentLastHour, sentLastDay, anyOutbound] = await Promise.all([
          tx.message.count({ where: { conversationId, direction: "OUTBOUND", sentAt: { gte: hourAgo } } }),
          tx.message.count({ where: { conversationId, direction: "OUTBOUND", sentAt: { gte: dayAgo } } }),
          tx.message.count({ where: { conversationId, direction: "OUTBOUND" } }),
        ]);
        // Generation already waited out the debounce; the plan's delay starts now.
        const plan = planReply({ inboundAt: [new Date(Date.now() - auto.rules.debounce.quietSec * 1000)], isFirstReply: anyOutbound === 0, rules: auto.rules, sentLastHour, sentLastDay, replyChars: out.reply.length });
        if (plan.ok) scheduledFor = plan.sendAt;
        else autoNote = ` Auto-send skipped: ${plan.reason}.`;
      } else if (pol.aiMayAutoSend && warnings.length) {
        autoNote = ` Held for review: ${warnings.map((w) => w.code).join(", ")}.`;
      }
      const draft = await tx.draft.create({
        data: {
          ...base,
          status: scheduledFor ? "QUEUED" : "PROPOSED",
          nextAction: out.action,
          body,
          originalBody: body,
          explanation: (out.explanation + autoNote).trim(),
          intendedMode: scheduledFor ? "auto" : "draft",
          scheduledFor,
        },
      });
      await rememberFacts(tx, conv.customerId, out.remember ?? []);
      await tx.funnelEvent.create({ data: { type: "reply_drafted", conversationId, customerId: conv.customerId, draftId: draft.id, variant: base.variant, isSimulated: conv.account.isSimulated } });
      if (scheduledFor) {
        await enqueue(tx, { type: "dispatch_draft", conversationId, runAt: scheduledFor, payload: { draftId: draft.id }, dedupeKey: `draft:${draft.id}` });
      } else {
        await notify(tx, { kind: "draft_ready", title: "A reply is ready for you", body: `${label}`, link: `/inbox?c=${conversationId}`, dedupeKey: `draft:${conversationId}`, cooldownMin: auto.rules.notifications.cooldownMin });
      }
      log("info", "draft_created", { conversationId, draftId: draft.id, status: draft.status });
      return { outcome: scheduledFor ? "queued" : "proposed" };
    },
    { timeout: 15000 },
  );
}
