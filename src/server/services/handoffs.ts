import type { Tx } from "../db";
import { notify } from "../notify/notify";
import { CATEGORY_LABEL } from "../scoring/triage";
import { invalidateAiWork, bumpVersion } from "./shared";
import { audit } from "../audit";
import type { Rules } from "../automation/settings";

/**
 * Create (or escalate) a handoff. Pausing is applied as a conversation-level PAUSED override,
 * which automation only leaves through an explicit Resume.
 */
export async function createHandoff(
  tx: Tx,
  opts: {
    conversationId: string;
    category: keyof typeof CATEGORY_LABEL;
    priority: number;
    evidence?: string;
    reason?: string;
    rules: Rules;
    pause?: boolean;
    customerLabel: string;
  },
) {
  const existing = await tx.handoff.findFirst({
    where: { conversationId: opts.conversationId, category: opts.category, status: { in: ["OPEN", "CLAIMED"] } },
  });
  let handoff;
  if (existing) {
    handoff = await tx.handoff.update({
      where: { id: existing.id },
      data: { priority: Math.max(existing.priority, opts.priority), evidence: opts.evidence ?? existing.evidence },
    });
  } else {
    handoff = await tx.handoff.create({
      data: {
        conversationId: opts.conversationId,
        category: opts.category,
        reason: opts.reason ?? CATEGORY_LABEL[opts.category],
        priority: opts.priority,
        evidence: opts.evidence?.slice(0, 200),
      },
    });
    await tx.funnelEvent.create({ data: { type: "handoff_created", conversationId: opts.conversationId, meta: { category: opts.category } } });
  }
  const shouldPause = opts.pause ?? opts.rules.handoff.pauseOnHandoff;
  if (shouldPause) {
    const conv = await tx.conversation.findUniqueOrThrow({ where: { id: opts.conversationId } });
    if (conv.modeOverride !== "PAUSED") {
      await bumpVersion(tx, opts.conversationId, { modeOverride: "PAUSED" });
      await invalidateAiWork(tx, opts.conversationId, `Paused for handoff: ${CATEGORY_LABEL[opts.category]}`, { cancelGeneration: true, newStatus: "CANCELLED" });
      await audit("conversation.paused_by_handoff", { tx, target: opts.conversationId, details: { category: opts.category } });
    }
  }
  if (!existing) {
    await notify(tx, {
      kind: "handoff",
      title: `Handoff: ${CATEGORY_LABEL[opts.category]}`,
      body: `${opts.customerLabel} · priority ${opts.priority}`,
      link: `/inbox?c=${opts.conversationId}`,
      dedupeKey: `handoff:${opts.conversationId}:${opts.category}`,
      cooldownMin: opts.rules.notifications.cooldownMin,
    });
  }
  return handoff;
}
