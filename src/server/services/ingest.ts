import { db, Prisma, type Tx } from "../db";
import { getAutomation } from "../automation/settings";
import { debounceRunAt } from "../automation/timing";
import { enqueue, lockConversation } from "../queue/jobs";
import { scoreMessage, nextIntent } from "../scoring/intent";
import { triage } from "../scoring/triage";
import { createHandoff } from "./handoffs";
import { bumpVersion, invalidateAiWork, loadConv, policyFor } from "./shared";
import type { ProviderMessage } from "../providers/messaging/types";

export const customerLabel = (id: string) => `Customer …${id.slice(-4)}`;

async function ensureConversation(tx: Tx, accountId: string, chatId: string, customerExternalId: string, customerName?: string) {
  const customer = await tx.customer.upsert({
    where: { accountId_externalId: { accountId, externalId: customerExternalId } },
    create: { accountId, externalId: customerExternalId, displayName: customerName?.slice(0, 80) || `Fan ${customerExternalId}` },
    update: {},
  });
  const conv = await tx.conversation.upsert({
    where: { accountId_externalChatId: { accountId, externalChatId: chatId } },
    create: { accountId, customerId: customer.id, externalChatId: chatId },
    update: {},
  });
  return conv.id;
}

export type IngestResult = { duplicate: boolean; conversationId: string; messageId?: string; handoffs: string[] };

/**
 * Ingest one inbound customer message (from webhook, polling or simulator). Idempotent on
 * (conversation, provider message id). Everything—message row, version bump, invalidation,
 * scoring, handoff and the debounced generation job—commits atomically.
 */
export async function ingestInbound(input: { accountId: string; chatId: string; customerExternalId?: string; customerName?: string; message: ProviderMessage }): Promise<IngestResult> {
  return db().$transaction(async (tx) => {
    const conversationId = await ensureConversation(tx, input.accountId, input.chatId, input.customerExternalId ?? input.chatId, input.customerName);
    await lockConversation(tx, conversationId);
    const dup = await tx.message.findUnique({ where: { conversationId_externalId: { conversationId, externalId: input.message.externalId } } });
    if (dup) return { duplicate: true, conversationId, handoffs: [] };

    const automation = await getAutomation(tx);
    const rules = automation.rules;
    const before = await loadConv(tx, conversationId);
    const sentAt = input.message.sentAt;
    const isLatest = !before.lastInboundAt || sentAt >= before.lastInboundAt;

    const msg = await tx.message.create({
      data: { conversationId, direction: "INBOUND", origin: "CUSTOMER", body: input.message.body.slice(0, 5000), externalId: input.message.externalId, sentAt },
    });

    // An out-of-order (older) message still invalidates drafts: the context they were built on is incomplete.
    await bumpVersion(tx, conversationId, {
      lastInboundAt: isLatest ? sentAt : before.lastInboundAt,
      firstUnansweredAt:
        before.lastOutboundAt && sentAt < before.lastOutboundAt ? before.firstUnansweredAt : (before.firstUnansweredAt && before.firstUnansweredAt < sentAt ? before.firstUnansweredAt : sentAt),
      unreadCount: { increment: 1 },
    });
    await invalidateAiWork(tx, conversationId, "Customer sent a new message");

    // ---- Intent scoring (rules-based, with evidence) ----
    const signals = scoreMessage(msg.body, rules.scoring.weights);
    const priorPurchase = (await tx.purchase.count({ where: { customerId: before.customerId, verified: true } })) > 0;
    const last24 = await tx.message.count({ where: { conversationId, direction: "INBOUND", sentAt: { gte: new Date(Date.now() - 86400000) } } });
    const intent = nextIntent({
      current: before.customer.intentScore,
      updatedAt: before.customer.intentUpdatedAt,
      now: new Date(),
      signals,
      hasPriorVerifiedPurchase: priorPurchase,
      messagesLast24h: last24,
      rules: rules.scoring,
    });
    if (intent.signals.length) {
      await tx.intentSignal.createMany({
        data: intent.signals.map((s) => ({ customerId: before.customerId, messageId: msg.id, signal: s.signal, weight: s.weight, evidence: s.evidence })),
      });
    }
    const declined = signals.some((s) => s.signal === "decline");
    await tx.customer.update({
      where: { id: before.customerId },
      data: {
        intentScore: intent.score,
        intentUpdatedAt: new Date(),
        engagementScore: Math.min(100, last24 * 5),
        ...(declined
          ? { outcome: "DECLINED", declinedAt: new Date(), suppressedUntil: new Date(Date.now() + rules.offers.declineCooldownDays * 86400000) }
          : {}),
      },
    });
    await tx.message.update({ where: { id: msg.id }, data: { intentDelta: intent.delta } });
    if (declined) await tx.funnelEvent.create({ data: { type: "decline", conversationId, customerId: before.customerId, isSimulated: before.account.isSimulated } });

    // ---- Deterministic triage → handoffs ----
    const handoffs: string[] = [];
    const hits = triage(msg.body);
    for (const h of hits.filter((h) => h.handoff)) {
      if (h.category === "opt_out") await tx.customer.update({ where: { id: before.customerId }, data: { doNotContact: true } });
      const ho = await createHandoff(tx, { conversationId, category: h.category, priority: h.priority, evidence: h.evidence, rules, customerLabel: customerLabel(before.customerId) });
      handoffs.push(ho.id);
    }
    if (hits.some((h) => h.category === "purchase_interest") || (intent.score >= rules.handoff.intentThreshold && before.customer.intentScore < rules.handoff.intentThreshold)) {
      const ho = await createHandoff(tx, {
        conversationId,
        category: hits.some((h) => h.category === "purchase_interest") ? "purchase_interest" : "intent_threshold",
        priority: Math.round(Math.max(55, intent.score)),
        evidence: hits.find((h) => h.category === "purchase_interest")?.evidence ?? `Intent ${intent.score}`,
        rules,
        customerLabel: customerLabel(before.customerId),
      });
      handoffs.push(ho.id);
    }

    // ---- Debounced draft generation ----
    const conv = await loadConv(tx, conversationId);
    const policy = policyFor(conv, automation);
    const blockingHit = hits.some((h) => h.handoff);
    if (policy.aiMayDraft && !blockingHit) {
      const pending = await tx.job.findFirst({ where: { dedupeKey: `gen:${conversationId}`, status: "PENDING" } });
      const first = pending?.firstEventAt ?? new Date();
      const runAt = debounceRunAt(first, new Date(), rules.debounce);
      if (pending) await tx.job.update({ where: { id: pending.id }, data: { runAt } });
      else await enqueue(tx, { type: "generate_reply", conversationId, dedupeKey: `gen:${conversationId}`, runAt, firstEventAt: first, maxAttempts: 3 });
    }
    return { duplicate: false, conversationId, messageId: msg.id, handoffs };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 15000 });
}

/**
 * Outbound message observed on the provider (webhook `messages.sent` or polling). If it is one of
 * ours, reconcile; otherwise it was sent outside this app → record it and invalidate queued AI work.
 */
export async function ingestOutboundObserved(input: { accountId: string; chatId: string; message: ProviderMessage }) {
  return db().$transaction(async (tx) => {
    const conv = await tx.conversation.findUnique({ where: { accountId_externalChatId: { accountId: input.accountId, externalChatId: input.chatId } } });
    if (!conv) return { known: false };
    await lockConversation(tx, conv.id);
    const existing = await tx.message.findUnique({ where: { conversationId_externalId: { conversationId: conv.id, externalId: input.message.externalId } } });
    if (existing) return { known: true };
    const ours = await tx.outboundSend.findFirst({ where: { conversationId: conv.id, providerMessageId: input.message.externalId } });
    if (ours) return { known: true };
    // Uncertain send that actually went through?
    const norm = (s: string) => s.replace(/\s+/g, " ").trim();
    const uncertain = await tx.outboundSend.findMany({ where: { conversationId: conv.id, status: { in: ["UNCERTAIN", "IN_FLIGHT"] } } });
    const match = uncertain.find((u) => norm(u.body) === norm(input.message.body));
    if (match) {
      const { recordAccepted } = await import("./dispatch");
      await recordAccepted(tx, match.id, input.message.externalId, "Confirmed by provider event");
      return { known: true, reconciled: match.id };
    }
    await tx.message.create({
      data: { conversationId: conv.id, direction: "OUTBOUND", origin: "PROVIDER_SYNC", body: input.message.body.slice(0, 5000), externalId: input.message.externalId, sentAt: input.message.sentAt },
    });
    await bumpVersion(tx, conv.id, { lastOutboundAt: input.message.sentAt, firstUnansweredAt: null, unreadCount: 0 });
    await invalidateAiWork(tx, conv.id, "A reply was sent outside this app", { cancelGeneration: true });
    return { known: false, recorded: true };
  });
}
