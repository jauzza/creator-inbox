import type { Tx } from "../db";
import { effectiveMode, type PolicyResult } from "../automation/policy";
import { getAutomation, type Rules } from "../automation/settings";
import { cancelJobs } from "../queue/jobs";
import { notify } from "../notify/notify";
import type { Conversation, CreatorAccount, Customer } from "@/generated/prisma/client";

export type ConvBundle = Conversation & { account: CreatorAccount; customer: Customer };

export async function loadConv(tx: Tx, conversationId: string): Promise<ConvBundle> {
  return tx.conversation.findUniqueOrThrow({ where: { id: conversationId }, include: { account: true, customer: true } });
}

export function isExcluded(c: Customer, conv: Conversation, rules: Rules) {
  const tags = new Set([...c.tags, ...conv.tags]);
  return rules.exclusions.customerIds.includes(c.id) || rules.exclusions.tags.some((t) => tags.has(t));
}

export type Automation = Awaited<ReturnType<typeof getAutomation>>;
export function policyFor(conv: ConvBundle, a: Automation): PolicyResult & { rules: Rules } {
  const p = effectiveMode({
    globalMode: a.globalMode,
    emergencyStop: a.emergencyStop,
    accountMode: conv.account.modeOverride,
    conversationMode: conv.modeOverride,
    takenOver: !!conv.takenOverById,
    takeoverExpiresAt: conv.takeoverExpiresAt,
    excluded: isExcluded(conv.customer, conv, a.rules),
    doNotContact: conv.customer.doNotContact,
    accountConnected: conv.account.connectionStatus === "CONNECTED",
  });
  return { ...p, rules: a.rules };
}

/**
 * Invalidate queued/pending AI work for a conversation. Called on new inbound messages,
 * outbound messages sent elsewhere, takeover, pause and mode changes.
 */
export async function invalidateAiWork(tx: Tx, conversationId: string, reason: string, opts: { cancelGeneration?: boolean; newStatus?: "STALE" | "CANCELLED" } = {}) {
  const status = opts.newStatus ?? "STALE";
  const drafts = await tx.draft.findMany({ where: { conversationId, status: { in: ["PROPOSED", "APPROVED", "QUEUED"] } }, select: { id: true, status: true } });
  if (drafts.length) {
    await tx.draft.updateMany({ where: { id: { in: drafts.map((d) => d.id) } }, data: { status, rejectedReason: reason } });
    await tx.outboundSend.updateMany({ where: { draftId: { in: drafts.map((d) => d.id) }, status: "PENDING" }, data: { status: "ABANDONED", lastError: reason } });
  }
  await cancelJobs(tx, { conversationId, types: opts.cancelGeneration ? ["dispatch_draft", "generate_reply"] : ["dispatch_draft"] }, reason);
  const humanApproved = drafts.filter((d) => d.status === "APPROVED").length;
  if (humanApproved) {
    await notify(tx, {
      kind: "stale",
      title: "Approved reply was not sent",
      body: `${reason}. Review the conversation before sending.`,
      link: `/inbox?c=${conversationId}`,
      dedupeKey: `stale:${conversationId}`,
      cooldownMin: 5,
    });
  }
  return drafts.length;
}

export async function bumpVersion(tx: Tx, conversationId: string, data: Record<string, unknown> = {}) {
  return tx.conversation.update({ where: { id: conversationId }, data: { ...data, version: { increment: 1 } } });
}
