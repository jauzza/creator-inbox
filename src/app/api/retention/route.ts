import { z } from "zod";
import { api } from "@/server/http";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { HttpError } from "@/server/auth/access";

/** Owner-triggered retention purge. Permanent: the UI requires typing the confirmation phrase. */
export const POST = api(
  { auth: "owner", body: z.object({ kind: z.enum(["messages", "audit", "jobs", "ai_usage"]), olderThanDays: z.number().int().min(7).max(3650), confirm: z.literal("DELETE") }) },
  async ({ user, body }) => {
    const before = new Date(Date.now() - body.olderThanDays * 86400000);
    let count = 0;
    if (body.kind === "messages") count = (await db().message.deleteMany({ where: { sentAt: { lt: before } } })).count;
    else if (body.kind === "audit") count = (await db().auditLog.deleteMany({ where: { createdAt: { lt: before } } })).count;
    else if (body.kind === "jobs") count = (await db().job.deleteMany({ where: { finishedAt: { lt: before }, status: { in: ["DONE", "FAILED", "CANCELLED"] } } })).count;
    else if (body.kind === "ai_usage") count = (await db().aiUsage.deleteMany({ where: { createdAt: { lt: before } } })).count;
    else throw new HttpError(400, "Unknown kind");
    await audit("retention.purge", { actorId: user.id, details: { kind: body.kind, olderThanDays: body.olderThanDays, count } });
    return { deleted: count };
  },
);
