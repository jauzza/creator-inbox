import { db, Prisma, type Tx } from "../db";
import type { Job } from "@/generated/prisma/client";

/**
 * Durable Postgres job queue. Jobs are created in the SAME transaction as the domain change that
 * caused them (transactional outbox), so a crash can never leave a message without its job or a
 * cancelled draft with a live job. Never use in-memory timers for scheduling.
 */

export type JobType =
  | "generate_reply"
  | "dispatch_draft"
  | "dispatch_manual"
  | "reconcile_send"
  | "sync_account"
  | "notify_telegram"
  | "expire_takeover"
  | "run_eval";

export type EnqueueInput = {
  type: JobType;
  runAt?: Date;
  conversationId?: string | null;
  payload?: Record<string, unknown>;
  dedupeKey?: string;
  maxAttempts?: number;
  firstEventAt?: Date;
};

/** Create a job, or if a PENDING job with the same dedupe key exists, update its runAt/payload. */
export async function enqueue(tx: Tx, j: EnqueueInput): Promise<Job> {
  const data = {
    type: j.type,
    runAt: j.runAt ?? new Date(),
    conversationId: j.conversationId ?? null,
    payload: (j.payload ?? {}) as Prisma.InputJsonValue,
    dedupeKey: j.dedupeKey ?? null,
    maxAttempts: j.maxAttempts ?? 5,
    firstEventAt: j.firstEventAt ?? null,
  };
  if (j.dedupeKey) {
    const existing = await tx.job.findFirst({ where: { dedupeKey: j.dedupeKey, status: "PENDING" } });
    if (existing) return tx.job.update({ where: { id: existing.id }, data: { runAt: data.runAt, payload: data.payload } });
  }
  return tx.job.create({ data });
}

export async function cancelJobs(tx: Tx, where: { conversationId: string; types: JobType[] }, reason: string) {
  const r = await tx.job.updateMany({
    where: { conversationId: where.conversationId, type: { in: where.types }, status: "PENDING" },
    data: { status: "CANCELLED", lastError: reason, finishedAt: new Date() },
  });
  return r.count;
}

/**
 * Claim one due job. FOR UPDATE SKIP LOCKED lets several workers poll safely; jobs for a
 * conversation that already has a RUNNING job are skipped (per-conversation serialization).
 * Handlers additionally lock the Conversation row, which is the authoritative guard.
 */
export async function claimOne(workerId: string): Promise<Job | null> {
  const rows = await db().$queryRawUnsafe<Job[]>(
    `UPDATE "Job" SET "status" = 'RUNNING', "lockedAt" = now(), "lockedBy" = $1, "attempts" = "attempts" + 1
     WHERE "id" = (
       SELECT j."id" FROM "Job" j
       WHERE j."status" = 'PENDING' AND j."runAt" <= now()
         AND (j."conversationId" IS NULL OR NOT EXISTS (
           SELECT 1 FROM "Job" r WHERE r."conversationId" = j."conversationId" AND r."status" = 'RUNNING'))
       ORDER BY j."runAt" ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED)
     RETURNING *`,
    workerId,
  );
  return rows[0] ?? null;
}

export async function completeJob(id: string) {
  await db().job.update({ where: { id }, data: { status: "DONE", finishedAt: new Date(), lockedAt: null } });
}

function isUniqueViolation(e: unknown) {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

/** If a newer PENDING job with the same dedupe key exists, this one is superseded rather than re-queued. */
async function requeueOrSupersede(job: Job, data: Prisma.JobUpdateInput) {
  try {
    await db().job.update({ where: { id: job.id }, data });
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    await db().job.update({ where: { id: job.id }, data: { status: "CANCELLED", lastError: "Superseded by a newer job", finishedAt: new Date(), lockedAt: null } });
  }
}

export async function failJob(job: Job, error: string, opts: { retryInMs?: number; permanent?: boolean } = {}) {
  const giveUp = opts.permanent || job.attempts >= job.maxAttempts;
  if (giveUp) {
    await db().job.update({ where: { id: job.id }, data: { status: "FAILED", lastError: error.slice(0, 500), finishedAt: new Date(), lockedAt: null } });
    return "failed" as const;
  }
  const backoff = opts.retryInMs ?? Math.min(15 * 60_000, 2 ** job.attempts * 5000);
  await requeueOrSupersede(job, { status: "PENDING", lastError: error.slice(0, 500), runAt: new Date(Date.now() + backoff), lockedAt: null, lockedBy: null });
  return "retry" as const;
}

/** Reschedule without counting as a failure (e.g. outside active hours, rate-limit window). */
export async function rescheduleJob(job: Job, runAt: Date, note: string) {
  await requeueOrSupersede(job, { status: "PENDING", runAt, lastError: note, lockedAt: null, lockedBy: null, attempts: Math.max(0, job.attempts - 1) });
}

/** Crash recovery: RUNNING jobs whose worker died go back to PENDING. Send handlers reconcile IN_FLIGHT sends instead of resending. */
export async function recoverStuckJobs(olderThanMs = 5 * 60_000) {
  const r = await db().job.updateMany({
    where: { status: "RUNNING", lockedAt: { lt: new Date(Date.now() - olderThanMs) } },
    data: { status: "PENDING", lockedAt: null, lockedBy: null, lastError: "Recovered after worker stopped" },
  });
  return r.count;
}

/** Row lock on the conversation: the authoritative per-conversation serialization point. */
export async function lockConversation(tx: Tx, conversationId: string) {
  await tx.$queryRawUnsafe(`SELECT 1 FROM "Conversation" WHERE "id" = $1 FOR UPDATE`, conversationId);
}
