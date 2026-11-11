import { z } from "zod";
import { api } from "@/server/http";
import { db } from "@/server/db";

export const GET = api({ auth: "user" }, async ({ user }) => {
  const rows = await db().notification.findMany({ where: { OR: [{ userId: null }, { userId: user.id }] }, orderBy: { createdAt: "desc" }, take: 50 });
  return { unread: rows.filter((r) => !r.readAt).length, items: rows };
});
export const POST = api({ auth: "user", body: z.object({ ids: z.array(z.string()).max(100).optional(), all: z.boolean().optional() }) }, async ({ user, body }) => {
  await db().notification.updateMany({ where: { readAt: null, OR: [{ userId: null }, { userId: user.id }], ...(body.all ? {} : { id: { in: body.ids ?? [] } }) }, data: { readAt: new Date() } });
  return { ok: true };
});
