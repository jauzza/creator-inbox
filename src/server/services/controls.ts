import { db, type Tx } from "../db";
import { getAutomation } from "../automation/settings";
import { RESTRICTIVENESS } from "../automation/policy";
import { enqueue, cancelJobs, lockConversation } from "../queue/jobs";
import { audit } from "../audit";
import { HttpError } from "../auth/access";
import { bumpVersion, invalidateAiWork, loadConv, policyFor } from "./shared";
import type { AutomationMode } from "@/generated/prisma/client";

export const DRAFT_LABELS = ["too_formal", "too_casual", "repetitive", "invented_fact", "wrong_tone", "wrong_context", "too_pushy", "too_long", "good"] as const;

/** Approve (optionally edited) draft → dispatch now. Rejects if the conversation changed unless `force`. */
export async function approveDraft(userId: string, draftId: string, opts: { body?: string; labels?: string[]; force?: boolean }) {
  return db().$transaction(async (tx) => {
    const d0 = await tx.draft.findUniqueOrThrow({ where: { id: draftId } });
    await lockConversation(tx, d0.conversationId);
    const draft = await tx.draft.findUniqueOrThrow({ where: { id: draftId } });
    const conv = await loadConv(tx, draft.conversationId);
    const auto = await getAutomation(tx);
    if (auto.emergencyStop) throw new HttpError(409, "Emergency stop is on. Nothing can be sent until it is turned off.");
    const okStatus = draft.status === "PROPOSED" || draft.status === "HANDOFF" || (opts.force && draft.status === "STALE");
    if (!okStatus) throw new HttpError(409, `This draft is ${draft.status.toLowerCase()} and can't be approved`);
    if (draft.basedOnVersion !== conv.version && !opts.force)
      throw new HttpError(409, "The conversation changed since this draft was written. Review the new messages, then use “Send anyway” or regenerate.");
    const body = (opts.body ?? draft.body).trim();
    if (!body) throw new HttpError(400, "Reply is empty");
    const edited = body !== draft.originalBody;
    await tx.draft.update({
      where: { id: draftId },
      data: {
        status: "APPROVED",
        body,
        approvedById: userId,
        approvedAt: new Date(),
        labels: opts.labels?.filter((l) => (DRAFT_LABELS as readonly string[]).includes(l)) ?? draft.labels,
        // A forced send is re-based on the current version: the human has seen the latest messages.
        basedOnVersion: conv.version,
      },
    });
    await tx.funnelEvent.create({ data: { type: edited ? "reply_edited" : "reply_approved", conversationId: conv.id, customerId: conv.customerId, draftId, variant: draft.variant, isSimulated: conv.account.isSimulated } });
    await enqueue(tx, { type: "dispatch_draft", conversationId: conv.id, payload: { draftId }, dedupeKey: `draft:${draftId}` });
    await audit("draft.approved", { tx, actorId: userId, target: draftId, details: { edited, forced: !!opts.force } });
    return { edited };
  });
}

export async function rejectDraft(userId: string, draftId: string, opts: { reason?: string; labels?: string[] }) {
  return db().$transaction(async (tx) => {
    const d = await tx.draft.findUniqueOrThrow({ where: { id: draftId }, include: { conversation: { include: { account: true } } } });
    if (!["PROPOSED", "HANDOFF", "STALE", "QUEUED"].includes(d.status)) throw new HttpError(409, `Draft is ${d.status}`);
    await tx.draft.update({ where: { id: draftId }, data: { status: "REJECTED", rejectedReason: opts.reason?.slice(0, 300), labels: opts.labels ?? d.labels } });
    await cancelJobs(tx, { conversationId: d.conversationId, types: ["dispatch_draft"] }, "Draft rejected");
    await tx.funnelEvent.create({ data: { type: "reply_rejected", conversationId: d.conversationId, draftId, variant: d.variant, isSimulated: d.conversation.account.isSimulated, meta: { labels: opts.labels ?? [] } } });
    await audit("draft.rejected", { tx, actorId: userId, target: draftId, details: { labels: opts.labels } });
  });
}

/** Cancel a queued auto-reply before it is dispatched. A request already accepted by the provider cannot be retracted. */
export async function cancelQueued(userId: string, draftId: string) {
  return db().$transaction(async (tx) => {
    const d = await tx.draft.findUniqueOrThrow({ where: { id: draftId } });
    await lockConversation(tx, d.conversationId);
    const cur = await tx.draft.findUniqueOrThrow({ where: { id: draftId } });
    if (cur.status === "SENDING" || cur.status === "SENT" || cur.status === "UNCERTAIN")
      throw new HttpError(409, "Too late: this reply was already handed to the provider and may not be retractable.");
    if (cur.status !== "QUEUED" && cur.status !== "APPROVED") throw new HttpError(409, `Draft is ${cur.status}`);
    await tx.draft.update({ where: { id: draftId }, data: { status: "PROPOSED", scheduledFor: null, intendedMode: "draft" } });
    await cancelJobs(tx, { conversationId: d.conversationId, types: ["dispatch_draft"] }, "Cancelled by operator");
    await audit("draft.cancel_queued", { tx, actorId: userId, target: draftId });
  });
}

export async function regenerate(userId: string, conversationId: string) {
  return db().$transaction(async (tx) => {
    await lockConversation(tx, conversationId);
    const conv = await loadConv(tx, conversationId);
    const pol = policyFor(conv, await getAutomation(tx));
    if (!pol.aiMayDraft) throw new HttpError(409, `AI drafting is off here: ${pol.reasons.join("; ")}`);
    await invalidateAiWork(tx, conversationId, "Regenerated by operator", { newStatus: "CANCELLED" });
    if (!conv.firstUnansweredAt) await tx.conversation.update({ where: { id: conversationId }, data: { firstUnansweredAt: conv.lastInboundAt ?? new Date() } });
    await enqueue(tx, { type: "generate_reply", conversationId, dedupeKey: `gen:${conversationId}`, firstEventAt: new Date(), maxAttempts: 3 });
    await audit("draft.regenerate", { tx, actorId: userId, target: conversationId });
  });
}

/** Take over: cancels pending AI work immediately. Automation resumes only via resume() or a configured expiry. */
export async function takeOver(userId: string, conversationId: string) {
  return db().$transaction(async (tx) => {
    await lockConversation(tx, conversationId);
    const auto = await getAutomation(tx);
    const expiryMin = auto.rules.handoff.takeoverExpiryMin;
    const expires = expiryMin > 0 ? new Date(Date.now() + expiryMin * 60000) : null;
    await bumpVersion(tx, conversationId, { takenOverById: userId, takenOverAt: new Date(), takeoverExpiresAt: expires });
    const n = await invalidateAiWork(tx, conversationId, "Operator took over", { cancelGeneration: true, newStatus: "CANCELLED" });
    const inFlight = await tx.outboundSend.count({ where: { conversationId, status: "IN_FLIGHT" } });
    if (expires) await enqueue(tx, { type: "expire_takeover", conversationId, runAt: expires, dedupeKey: `takeover:${conversationId}` });
    const conv = await loadConv(tx, conversationId);
    await tx.funnelEvent.create({ data: { type: "takeover", conversationId, customerId: conv.customerId, isSimulated: conv.account.isSimulated } });
    await audit("conversation.takeover", { tx, actorId: userId, target: conversationId, details: { cancelledDrafts: n, inFlight } });
    return { cancelledDrafts: n, inFlight, expiresAt: expires };
  });
}

export async function resume(userId: string | null, conversationId: string, reason = "Resumed by operator") {
  return db().$transaction(async (tx) => {
    await lockConversation(tx, conversationId);
    const conv = await loadConv(tx, conversationId);
    const clearOverride = conv.modeOverride === "PAUSED" || conv.modeOverride === "MANUAL";
    await bumpVersion(tx, conversationId, { takenOverById: null, takenOverAt: null, takeoverExpiresAt: null, ...(clearOverride ? { modeOverride: null } : {}) });
    await cancelJobs(tx, { conversationId, types: ["expire_takeover"] }, reason);
    const fresh = await loadConv(tx, conversationId);
    const pol = policyFor(fresh, await getAutomation(tx));
    if (pol.aiMayDraft && fresh.firstUnansweredAt)
      await enqueue(tx, { type: "generate_reply", conversationId, dedupeKey: `gen:${conversationId}`, firstEventAt: new Date(), maxAttempts: 3 });
    await audit("conversation.resume", { tx, actorId: userId, actorKind: userId ? "user" : "worker", target: conversationId, details: { reason, mode: pol.mode } });
    return { mode: pol.mode, reasons: pol.reasons };
  });
}

export async function setConversationMode(userId: string, conversationId: string, mode: AutomationMode | null) {
  return db().$transaction(async (tx) => {
    await lockConversation(tx, conversationId);
    const before = await loadConv(tx, conversationId);
    await bumpVersion(tx, conversationId, { modeOverride: mode });
    if (mode && RESTRICTIVENESS[mode] >= RESTRICTIVENESS.MANUAL) await invalidateAiWork(tx, conversationId, `Conversation set to ${mode}`, { cancelGeneration: true, newStatus: "CANCELLED" });
    else if (mode === "DRAFT") await revertQueuedToProposed(tx, { conversationId }, "Conversation set to Draft");
    await audit("conversation.mode", { tx, actorId: userId, target: conversationId, details: { from: before.modeOverride, to: mode } });
  });
}

async function revertQueuedToProposed(tx: Tx, where: { conversationId?: string; accountId?: string }, reason: string) {
  const drafts = await tx.draft.findMany({
    where: { status: "QUEUED", ...(where.conversationId ? { conversationId: where.conversationId } : {}), ...(where.accountId ? { conversation: { accountId: where.accountId } } : {}) },
    select: { id: true, conversationId: true },
  });
  if (!drafts.length) return 0;
  await tx.draft.updateMany({ where: { id: { in: drafts.map((d) => d.id) } }, data: { status: "PROPOSED", scheduledFor: null, intendedMode: "draft", explanation: reason } });
  await tx.job.updateMany({
    where: { type: "dispatch_draft", status: "PENDING", dedupeKey: { in: drafts.map((d) => `draft:${d.id}`) } },
    data: { status: "CANCELLED", lastError: reason, finishedAt: new Date() },
  });
  return drafts.length;
}

export async function setAccountMode(userId: string, accountId: string, mode: AutomationMode | null) {
  return db().$transaction(async (tx) => {
    await tx.creatorAccount.update({ where: { id: accountId }, data: { modeOverride: mode } });
    if (mode && mode !== "AUTO") await revertQueuedToProposed(tx, { accountId }, `Account set to ${mode}`);
    await audit("account.mode", { tx, actorId: userId, target: accountId, details: { to: mode } });
  });
}

export async function setGlobalMode(userId: string, mode: AutomationMode) {
  return db().$transaction(async (tx) => {
    await getAutomation(tx);
    await tx.automationSettings.update({ where: { id: "global" }, data: { globalMode: mode } });
    const reverted = mode !== "AUTO" ? await revertQueuedToProposed(tx, {}, `Global mode set to ${mode}`) : 0;
    await audit("automation.global_mode", { tx, actorId: userId, details: { to: mode, reverted } });
    return { reverted };
  });
}

/** Emergency stop: takes effect for every dispatch from the moment this commits (dispatch re-reads it under lock). */
export async function setEmergencyStop(userId: string, on: boolean) {
  return db().$transaction(async (tx) => {
    await getAutomation(tx);
    await tx.automationSettings.update({ where: { id: "global" }, data: { emergencyStop: on, emergencyStopAt: on ? new Date() : null, emergencyStopById: on ? userId : null } });
    let reverted = 0;
    let inFlight = 0;
    if (on) {
      reverted = await revertQueuedToProposed(tx, {}, "Emergency stop");
      await tx.draft.updateMany({ where: { status: "APPROVED" }, data: { status: "PROPOSED", explanation: "Approved, but not sent: emergency stop" } });
      await tx.job.updateMany({ where: { type: { in: ["dispatch_draft", "dispatch_manual"] }, status: "PENDING" }, data: { status: "CANCELLED", lastError: "Emergency stop", finishedAt: new Date() } });
      await tx.outboundSend.updateMany({ where: { status: "PENDING" }, data: { status: "ABANDONED", lastError: "Emergency stop" } });
      inFlight = await tx.outboundSend.count({ where: { status: "IN_FLIGHT" } });
    }
    await audit(on ? "automation.emergency_stop.on" : "automation.emergency_stop.off", { tx, actorId: userId, details: { reverted, inFlight } });
    return { reverted, inFlight };
  });
}
