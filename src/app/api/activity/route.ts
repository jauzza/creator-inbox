import { api } from "@/server/http";
import { db } from "@/server/db";

export const GET = api({ auth: "user" }, async ({ req }) => {
  const q = req.nextUrl.searchParams.get("q")?.slice(0, 60);
  const logs = await db().auditLog.findMany({ where: q ? { action: { contains: q } } : {}, orderBy: { createdAt: "desc" }, take: 200, include: { actor: { select: { name: true } } } });
  const failedJobs = await db().job.findMany({ where: { status: "FAILED" }, orderBy: { finishedAt: "desc" }, take: 20 });
  const webhookErrors = await db().webhookEvent.findMany({ where: { error: { not: null } }, orderBy: { receivedAt: "desc" }, take: 20 });
  const hb = await db().integrationConfig.findUnique({ where: { id: "worker_heartbeat" } });
  const accounts = await db().creatorAccount.findMany({ select: { displayName: true, connectionStatus: true, lastSyncError: true, lastSyncOkAt: true } });
  return {
    logs: logs.map((l) => ({ id: l.id, action: l.action, actor: l.actor?.name ?? l.actorKind, target: l.target, details: l.details, at: l.createdAt })),
    troubleshooting: {
      workerLastSeen: (hb?.settings as any)?.at ?? null,
      failedJobs: failedJobs.map((j) => ({ id: j.id, type: j.type, error: j.lastError, at: j.finishedAt })),
      webhookErrors: webhookErrors.map((w) => ({ id: w.id, type: w.eventType, error: w.error, at: w.receivedAt })),
      accounts,
    },
  };
});
