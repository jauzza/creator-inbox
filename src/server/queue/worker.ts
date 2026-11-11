import { hostname } from "node:os";
import { claimOne, completeJob, failJob, recoverStuckJobs, rescheduleJob } from "./jobs";
import { runJob } from "./handlers";
import { log } from "../audit";
import { db } from "../db";

/** Runs one due job if any. Returns false when the queue had nothing due. Exported for tests. */
export async function runOnce(workerId = `${hostname()}:${process.pid}`): Promise<boolean> {
  const job = await claimOne(workerId);
  if (!job) return false;
  try {
    const r = await runJob(job);
    if (r.permanentError) await failJob(job, r.permanentError, { permanent: true });
    else if (r.rescheduleAt) await rescheduleJob(job, r.rescheduleAt, r.outcome);
    else if (r.retryInMs != null) await failJob(job, r.outcome, { retryInMs: r.retryInMs });
    else {
      await completeJob(job.id);
      await db().job.update({ where: { id: job.id }, data: { lastError: r.outcome.slice(0, 500) } });
    }
    log("info", "job", { id: job.id, type: job.type, outcome: r.outcome });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const res = await failJob(job, msg);
    log("error", "job_error", { id: job.id, type: job.type, error: msg, result: res });
  }
  return true;
}

/** Drain everything currently due (tests and the simulator "run queue now" button). */
export async function drain(max = 200) {
  let n = 0;
  while (n < max && (await runOnce("drain"))) n++;
  return n;
}

export async function startWorker(opts: { concurrency: number; pollMs: number }) {
  let stopping = false;
  const stop = () => {
    stopping = true;
    log("info", "worker_stopping");
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
  log("info", "worker_started", { concurrency: opts.concurrency });
  const recovered = await recoverStuckJobs();
  if (recovered) log("warn", "recovered_stuck_jobs", { count: recovered });
  let lastRecovery = Date.now();
  let lastHeartbeat = 0;
  const loop = async (i: number) => {
    while (!stopping) {
      try {
        const worked = await runOnce(`${hostname()}:${process.pid}:${i}`);
        if (!worked) await new Promise((r) => setTimeout(r, opts.pollMs));
        if (i === 0 && Date.now() - lastRecovery > 60_000) {
          lastRecovery = Date.now();
          await recoverStuckJobs();
        }
        if (i === 0 && Date.now() - lastHeartbeat > 15_000) {
          lastHeartbeat = Date.now();
          await db().integrationConfig.upsert({
            where: { id: "worker_heartbeat" },
            create: { id: "worker_heartbeat", provider: "worker", settings: { at: new Date().toISOString(), pid: process.pid } },
            update: { settings: { at: new Date().toISOString(), pid: process.pid } },
          });
        }
      } catch (e) {
        log("error", "worker_loop_error", { error: e instanceof Error ? e.message : String(e) });
        await new Promise((r) => setTimeout(r, opts.pollMs * 3));
      }
    }
  };
  await Promise.all(Array.from({ length: opts.concurrency }, (_, i) => loop(i)));
  await db().$disconnect();
  log("info", "worker_stopped");
}
