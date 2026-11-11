import { randomBytes } from "node:crypto";
import { db, Prisma, type Tx } from "../db";
import { getAutomation } from "../automation/settings";
import { isSendableTime, nextSendableTime } from "../automation/timing";
import { enqueue, lockConversation } from "../queue/jobs";
import { providerForAccount } from "../providers/messaging/registry";
import { notify } from "../notify/notify";
import { audit, log } from "../audit";
import { HttpError } from "../auth/access";
import { bumpVersion, loadConv, policyFor } from "./shared";
import { createHandoff } from "./handoffs";
import { customerLabel } from "./ingest";
import type { MessageOrigin } from "@/generated/prisma/client";

export type DispatchOutcome = { outcome: string; rescheduleAt?: Date; retryInMs?: number };

/**
 * Worker handler for `dispatch_draft`. Re-checks EVERYTHING at dispatch time inside a transaction
 * that holds the conversation row lock: emergency stop, effective mode, ownership, version
 * (new inbound/outbound/takeover), draft age, caps, active hours and provider pacing.
 */
export async function dispatchDraft(draftId: string): Promise<DispatchOutcome> {
  const prep = await db().$transaction(
    async (tx): Promise<DispatchOutcome | { sendId: string }> => {
      const draft0 = await tx.draft.findUnique({ where: { id: draftId } });
      if (!draft0) return { outcome: "missing" };
      await lockConversation(tx, draft0.conversationId);
      const draft = await tx.draft.findUniqueOrThrow({ where: { id: draftId } });
      if (draft.status !== "QUEUED" && draft.status !== "APPROVED") return { outcome: `skipped: draft is ${draft.status}` };
      const conv = await loadConv(tx, draft.conversationId);
      const auto = await getAutomation(tx);
      const pol = policyFor(conv, auto);
      const isAuto = draft.status === "QUEUED";
      const revert = async (reason: string) => {
        await tx.draft.update({ where: { id: draft.id }, data: { status: "PROPOSED", scheduledFor: null, explanation: `${draft.explanation ?? ""} Not sent: ${reason}.`.trim() } });
        return { outcome: `reverted: ${reason}` };
      };

      if (auto.emergencyStop) return revert("global emergency stop is on");
      if (!pol.sendsAllowed) return revert(pol.reasons.join("; "));
      if (isAuto && !pol.aiMayAutoSend) return revert(`mode is now ${pol.mode}`);
      if (draft.basedOnVersion !== conv.version) {
        await tx.draft.update({ where: { id: draft.id }, data: { status: "STALE", rejectedReason: "Conversation changed after this draft was created" } });
        if (pol.aiMayDraft && conv.firstUnansweredAt)
          await enqueue(tx, { type: "generate_reply", conversationId: conv.id, dedupeKey: `gen:${conv.id}`, firstEventAt: new Date(), maxAttempts: 3 });
        return { outcome: "stale: version changed" };
      }
      if (isAuto) {
        const ageMin = (Date.now() - draft.createdAt.getTime()) / 60000;
        if (ageMin > auto.rules.maxDraftAgeMin) {
          await tx.draft.update({ where: { id: draft.id }, data: { status: "STALE", rejectedReason: `Older than ${auto.rules.maxDraftAgeMin} min; re-evaluated` } });
          await enqueue(tx, { type: "generate_reply", conversationId: conv.id, dedupeKey: `gen:${conv.id}`, firstEventAt: new Date(), maxAttempts: 3 });
          return { outcome: "stale: too old" };
        }
        const hourAgo = new Date(Date.now() - 3600000), dayAgo = new Date(Date.now() - 86400000);
        const [h, d] = await Promise.all([
          tx.message.count({ where: { conversationId: conv.id, direction: "OUTBOUND", sentAt: { gte: hourAgo } } }),
          tx.message.count({ where: { conversationId: conv.id, direction: "OUTBOUND", sentAt: { gte: dayAgo } } }),
        ]);
        if (h >= auto.rules.caps.perChatPerHour || d >= auto.rules.caps.perChatPerDay) return revert("per-chat cap reached");
        if (!isSendableTime(new Date(), auto.rules).ok) {
          const next = nextSendableTime(new Date(), auto.rules);
          if (!next) return revert("no sendable time configured");
          await tx.draft.update({ where: { id: draft.id }, data: { scheduledFor: next } });
          return { outcome: "deferred: outside active hours", rescheduleAt: next };
        }
        const lastOut = conv.lastOutboundAt?.getTime() ?? 0;
        const cooldownUntil = lastOut + auto.rules.queue.cooldownAfterSendSec * 1000;
        if (cooldownUntil > Date.now()) return { outcome: "deferred: cooldown", rescheduleAt: new Date(cooldownUntil) };
      }
      if (conv.account.nextSendAllowedAt && conv.account.nextSendAllowedAt > new Date())
        return { outcome: "deferred: provider pacing", rescheduleAt: conv.account.nextSendAllowedAt };

      const send = await tx.outboundSend.upsert({
        where: { idempotencyKey: `draft_${draft.id}` },
        create: {
          draftId: draft.id,
          conversationId: conv.id,
          idempotencyKey: `draft_${draft.id}`,
          body: draft.body,
          origin: isAuto ? "AI_AUTO" : "AI_APPROVED",
          requestedById: draft.approvedById,
          isSimulated: conv.account.isSimulated,
        },
        update: {},
      });
      if (send.status !== "PENDING") return { outcome: `skipped: send already ${send.status}` };
      await tx.draft.update({ where: { id: draft.id }, data: { status: "SENDING" } });
      await tx.creatorAccount.update({ where: { id: conv.accountId }, data: { nextSendAllowedAt: new Date(Date.now() + auto.rules.queue.accountMinIntervalSec * 1000) } });
      return { sendId: send.id };
    },
    { timeout: 15000 },
  );
  if (!("sendId" in prep)) return prep;
  return performSend(prep.sendId);
}

/** Human-written message from the composer. Emergency stop blocks it too. */
export async function queueManualSend(userId: string, conversationId: string, body: string) {
  return db().$transaction(async (tx) => {
    await lockConversation(tx, conversationId);
    const auto = await getAutomation(tx);
    if (auto.emergencyStop) throw new HttpError(409, "Emergency stop is on. Turn it off under Automation to send.");
    const conv = await loadConv(tx, conversationId);
    if (conv.customer.doNotContact) throw new HttpError(409, "This customer asked not to be contacted. Clear the flag on the customer first.");
    const send = await tx.outboundSend.create({
      data: { conversationId, idempotencyKey: `manual_${randomBytes(9).toString("hex")}`, body, origin: "HUMAN", requestedById: userId, isSimulated: conv.account.isSimulated },
    });
    // A human reply supersedes queued AI work.
    const { invalidateAiWork } = await import("./shared");
    await invalidateAiWork(tx, conversationId, "Operator sent a manual reply", { cancelGeneration: true, newStatus: "CANCELLED" });
    await enqueue(tx, { type: "dispatch_manual", conversationId, payload: { sendId: send.id }, dedupeKey: `send:${send.id}` });
    await audit("message.manual_send_queued", { tx, actorId: userId, target: conversationId });
    return send;
  });
}

export async function dispatchManual(sendId: string): Promise<DispatchOutcome> {
  const ok = await db().$transaction(async (tx) => {
    const s = await tx.outboundSend.findUnique({ where: { id: sendId } });
    if (!s || s.status !== "PENDING") return false;
    await lockConversation(tx, s.conversationId);
    const auto = await getAutomation(tx);
    if (auto.emergencyStop) {
      await tx.outboundSend.update({ where: { id: sendId }, data: { status: "ABANDONED", lastError: "Emergency stop" } });
      return false;
    }
    return true;
  });
  if (!ok) return { outcome: "skipped" };
  return performSend(sendId);
}

/** Moves PENDING → IN_FLIGHT, calls the provider, applies the outcome. IN_FLIGHT found later (crash) is reconciled, never resent. */
export async function performSend(sendId: string): Promise<DispatchOutcome> {
  const claimed = await db().$transaction(async (tx) => {
    const s = await tx.outboundSend.findUniqueOrThrow({ where: { id: sendId } });
    if (s.status === "IN_FLIGHT") return { recover: true as const, s };
    if (s.status !== "PENDING") return null;
    try {
      const updated = await tx.outboundSend.update({ where: { id: sendId }, data: { status: "IN_FLIGHT", attempts: { increment: 1 } } });
      return { recover: false as const, s: updated };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { busy: true as const };
      throw e;
    }
  });
  if (!claimed) return { outcome: "skipped: not pending" };
  if ("busy" in claimed) return { outcome: "busy: another send in flight", retryInMs: 3000 };
  if (claimed.recover) {
    await markUncertain(sendId, "Worker stopped while the send was in flight");
    return { outcome: "uncertain (recovered in-flight)" };
  }
  const s = claimed.s;
  const conv = await loadConv(db(), s.conversationId);
  if (s.isSimulated !== conv.account.isSimulated) throw new Error("Simulation flag mismatch; refusing to send");
  const provider = await providerForAccount(conv.account);
  if (provider.isSimulated !== conv.account.isSimulated) throw new Error("Provider/simulation mismatch; refusing to send");
  const result = await provider.sendText(conv.account.externalAccountId ?? conv.account.id, conv.externalChatId, s.body, s.idempotencyKey);
  log("info", "send_result", { sendId, status: result.status, simulated: provider.isSimulated });

  switch (result.status) {
    case "accepted":
      await db().$transaction(async (tx) => {
        await lockConversation(tx, s.conversationId);
        await recordAccepted(tx, sendId, result.providerMessageId, result.replayed ? "Idempotent replay" : undefined);
      });
      return { outcome: "sent" };
    case "rejected":
      await db().$transaction(async (tx) => {
        await tx.outboundSend.update({ where: { id: sendId }, data: { status: "FAILED", lastError: result.error } });
        if (s.draftId) await tx.draft.update({ where: { id: s.draftId }, data: { status: "FAILED", rejectedReason: result.error } });
        await notify(tx, { kind: "send_failed", title: "Message failed to send", body: `${customerLabel(conv.customerId)} · ${result.error.slice(0, 120)}`, link: `/inbox?c=${conv.id}`, dedupeKey: `fail:${sendId}` });
      });
      return { outcome: "failed" };
    case "retryable_not_sent": {
      const giveUp = s.attempts >= 5;
      await db().$transaction(async (tx) => {
        await tx.outboundSend.update({ where: { id: sendId }, data: { status: giveUp ? "FAILED" : "PENDING", lastError: result.error } });
        if (s.draftId) await tx.draft.update({ where: { id: s.draftId }, data: { status: giveUp ? "FAILED" : s.origin === "AI_AUTO" ? "QUEUED" : "APPROVED" } });
        if (result.retryAfterMs)
          await tx.creatorAccount.update({ where: { id: conv.accountId }, data: { nextSendAllowedAt: new Date(Date.now() + result.retryAfterMs) } });
      });
      return giveUp ? { outcome: "failed after retries" } : { outcome: "retry: not sent", retryInMs: result.retryAfterMs ?? 10000 };
    }
    case "unknown":
      await markUncertain(sendId, result.error);
      return { outcome: "uncertain" };
  }
}

async function markUncertain(sendId: string, error: string) {
  await db().$transaction(async (tx) => {
    const s = await tx.outboundSend.update({ where: { id: sendId }, data: { status: "UNCERTAIN", lastError: error } });
    if (s.draftId) await tx.draft.update({ where: { id: s.draftId }, data: { status: "UNCERTAIN" } });
    await enqueue(tx, { type: "reconcile_send", conversationId: s.conversationId, runAt: new Date(Date.now() + 30000), payload: { sendId, check: 1 }, dedupeKey: `reconcile:${sendId}` });
    await notify(tx, { kind: "send_uncertain", title: "Send result uncertain", body: "Checking with the provider before doing anything else.", link: `/inbox?c=${s.conversationId}`, dedupeKey: `uncertain:${sendId}` });
  });
}

export async function recordAccepted(tx: Tx, sendId: string, providerMessageId: string, note?: string) {
  const s = await tx.outboundSend.update({ where: { id: sendId }, data: { status: "ACCEPTED", providerMessageId, lastError: note ?? null } });
  const conv = await tx.conversation.findUniqueOrThrow({ where: { id: s.conversationId }, include: { account: true } });
  const now = new Date();
  const existing = await tx.message.findUnique({ where: { conversationId_externalId: { conversationId: s.conversationId, externalId: providerMessageId } } });
  const origin: MessageOrigin = s.origin;
  if (existing) {
    await tx.message.update({ where: { id: existing.id }, data: { origin, draftId: s.draftId, sentById: s.requestedById } });
  } else {
    await tx.message.create({
      data: { conversationId: s.conversationId, direction: "OUTBOUND", origin, body: s.body, externalId: providerMessageId, sentAt: now, draftId: s.draftId, sentById: s.requestedById },
    });
  }
  await bumpVersion(tx, s.conversationId, { lastOutboundAt: now, firstUnansweredAt: null, unreadCount: 0 });
  if (s.draftId) await tx.draft.update({ where: { id: s.draftId }, data: { status: "SENT" } });
  await tx.funnelEvent.create({
    data: { type: "reply_sent", conversationId: s.conversationId, customerId: conv.customerId, draftId: s.draftId, isSimulated: conv.account.isSimulated, meta: { origin } },
  });
}

/** Worker handler for `reconcile_send`: look for the message on the provider. Never resends automatically. */
export async function reconcileSend(sendId: string, check: number): Promise<DispatchOutcome> {
  const s = await db().outboundSend.findUnique({ where: { id: sendId } });
  if (!s || s.status !== "UNCERTAIN") return { outcome: "nothing to reconcile" };
  const conv = await loadConv(db(), s.conversationId);
  const provider = await providerForAccount(conv.account);
  const found = await provider.findSent(conv.account.externalAccountId ?? conv.account.id, conv.externalChatId, s.body, s.createdAt);
  if (found) {
    await db().$transaction(async (tx) => {
      await lockConversation(tx, s.conversationId);
      await recordAccepted(tx, sendId, found.providerMessageId, "Reconciled: found on provider");
    });
    return { outcome: "reconciled: delivered" };
  }
  if (check < 3) {
    await db().$transaction((tx) =>
      enqueue(tx, { type: "reconcile_send", conversationId: s.conversationId, runAt: new Date(Date.now() + 60000 * check), payload: { sendId, check: check + 1 }, dedupeKey: `reconcile:${sendId}` }),
    );
    return { outcome: `not found yet (check ${check})` };
  }
  const auto = await getAutomation();
  await db().$transaction((tx) =>
    createHandoff(tx, {
      conversationId: s.conversationId,
      category: "uncertain_send",
      priority: 65,
      evidence: found === null ? "Provider cannot confirm delivery" : "Not found on provider after 3 checks",
      rules: auto.rules,
      pause: false,
      customerLabel: customerLabel(conv.customerId),
    }),
  );
  return { outcome: "needs human review" };
}

/** Operator decision on an UNCERTAIN send. "retry" reuses the same idempotency key so a provider that did receive it replays instead of duplicating. */
export async function resolveUncertain(userId: string, sendId: string, action: "retry" | "mark_sent" | "discard") {
  return db().$transaction(async (tx) => {
    const s = await tx.outboundSend.findUniqueOrThrow({ where: { id: sendId } });
    if (s.status !== "UNCERTAIN") throw new HttpError(409, `Send is ${s.status}, not uncertain`);
    await lockConversation(tx, s.conversationId);
    if (action === "mark_sent") {
      await recordAccepted(tx, sendId, `manual_confirm_${s.id}`, "Operator confirmed delivery");
    } else if (action === "discard") {
      await tx.outboundSend.update({ where: { id: sendId }, data: { status: "ABANDONED", lastError: "Discarded by operator" } });
      if (s.draftId) await tx.draft.update({ where: { id: s.draftId }, data: { status: "CANCELLED" } });
    } else {
      const auto = await getAutomation(tx);
      if (auto.emergencyStop) throw new HttpError(409, "Emergency stop is on");
      await tx.outboundSend.update({ where: { id: sendId }, data: { status: "PENDING" } });
      await enqueue(tx, { type: "dispatch_manual", conversationId: s.conversationId, payload: { sendId }, dedupeKey: `send:${sendId}` });
    }
    await tx.handoff.updateMany({ where: { conversationId: s.conversationId, category: "uncertain_send", status: { in: ["OPEN", "CLAIMED"] } }, data: { status: "RESOLVED", resolvedAt: new Date(), outcome: action } });
    await audit(`send.uncertain.${action}`, { tx, actorId: userId, target: sendId });
  });
}
