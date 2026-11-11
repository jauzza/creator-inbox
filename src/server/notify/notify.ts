import { db, type Tx } from "../db";
import { enqueue } from "../queue/jobs";

export type NotifyInput = {
  kind: "handoff" | "draft_ready" | "send_failed" | "send_uncertain" | "budget" | "connection" | "test" | "stale";
  title: string;
  /** Minimal, non-sensitive summary. Never the customer's message body. */
  body: string;
  link?: string;
  dedupeKey?: string;
  cooldownMin?: number;
  userId?: string | null;
};

/** In-app notification + optional Telegram fan-out through the durable queue. Deduplicated with a cooldown. */
export async function notify(tx: Tx, n: NotifyInput) {
  if (n.dedupeKey && (n.cooldownMin ?? 0) > 0) {
    const recent = await tx.notification.findFirst({
      where: { dedupeKey: n.dedupeKey, createdAt: { gte: new Date(Date.now() - (n.cooldownMin ?? 0) * 60_000) } },
    });
    if (recent) return null;
  }
  const row = await tx.notification.create({
    data: { kind: n.kind, title: n.title.slice(0, 140), body: n.body.slice(0, 300), link: n.link, dedupeKey: n.dedupeKey, userId: n.userId ?? null },
  });
  const tg = await tx.integrationConfig.findUnique({ where: { id: "telegram" } });
  const kinds = ((tg?.settings as any)?.kinds as string[] | undefined) ?? ["handoff", "send_failed", "send_uncertain", "budget", "connection", "test"];
  if (tg?.enabled && kinds.includes(n.kind)) {
    await enqueue(tx, { type: "notify_telegram", payload: { notificationId: row.id }, dedupeKey: `tg:${row.id}`, maxAttempts: 6 });
  }
  return row;
}

export async function notifyNow(n: NotifyInput) {
  return db().$transaction((tx) => notify(tx, n));
}
