import { z } from "zod";
import { api } from "@/server/http";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { HttpError } from "@/server/auth/access";

/** Inspectable durable queue. */
export const GET = api({ auth: "user" }, async ({ req }) => {
  const status = req.nextUrl.searchParams.get("status") ?? "active";
  const where = status === "active" ? { status: { in: ["PENDING" as const, "RUNNING" as const] } } : { status: { in: ["DONE" as const, "FAILED" as const, "CANCELLED" as const] } };
  const jobs = await db().job.findMany({ where, orderBy: status === "active" ? { runAt: "asc" } : { finishedAt: "desc" }, take: 150, include: { conversation: { include: { customer: { select: { displayName: true } } } } } });
  const counts = await db().job.groupBy({ by: ["status"], _count: true });
  return {
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count])),
    jobs: jobs.map((j) => ({ id: j.id, type: j.type, status: j.status, runAt: j.runAt, attempts: j.attempts, maxAttempts: j.maxAttempts, lastError: j.lastError, conversationId: j.conversationId, customer: j.conversation?.customer.displayName ?? null, finishedAt: j.finishedAt })),
  };
});

export const POST = api({ auth: "user", body: z.object({ jobId: z.string(), action: z.enum(["cancel", "run_now"]) }) }, async ({ user, body }) => {
  const j = await db().job.findUniqueOrThrow({ where: { id: body.jobId } });
  if (j.status !== "PENDING") throw new HttpError(409, `Job is ${j.status}`);
  if (body.action === "cancel") {
    await db().job.update({ where: { id: j.id }, data: { status: "CANCELLED", lastError: "Cancelled by operator", finishedAt: new Date() } });
    if (j.type === "dispatch_draft") await db().draft.updateMany({ where: { id: String((j.payload as any).draftId), status: "QUEUED" }, data: { status: "PROPOSED", scheduledFor: null } });
  } else {
    if (j.type === "dispatch_draft" || j.type === "dispatch_manual") throw new HttpError(400, "Send jobs follow pacing rules; use the simulator's fast-forward for simulated chats");
    await db().job.update({ where: { id: j.id }, data: { runAt: new Date() } });
  }
  await audit(`job.${body.action}`, { actorId: user.id, target: j.id });
  return { ok: true };
});
