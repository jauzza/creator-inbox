import { z } from "zod";
import { api } from "@/server/http";
import { db } from "@/server/db";
import { hashPassword, passwordProblems } from "@/server/auth/password";
import { HttpError } from "@/server/auth/access";
import { audit } from "@/server/audit";

export const GET = api({ auth: "user" }, async () => {
  const users = await db().user.findMany({ include: { accountAccess: true }, orderBy: { createdAt: "asc" } });
  const accounts = await db().creatorAccount.findMany({ select: { id: true, displayName: true } });
  return { users: users.map((u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, disabled: u.disabled, accounts: u.accountAccess.map((a) => a.accountId) })), accounts };
});

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), email: z.string().email(), name: z.string().min(1).max(80), role: z.enum(["OWNER", "OPERATOR"]), password: z.string().max(256) }),
  z.object({ action: z.literal("access"), userId: z.string(), accountIds: z.array(z.string()).max(50) }),
  z.object({ action: z.literal("disable"), userId: z.string(), disabled: z.boolean() }),
]);

export const POST = api({ auth: "owner", body }, async ({ user, body }) => {
  if (body.action === "create") {
    const p = passwordProblems(body.password);
    if (p) throw new HttpError(400, p);
    const u = await db().user.create({ data: { email: body.email.toLowerCase(), name: body.name, role: body.role, passwordHash: await hashPassword(body.password) } });
    await audit("team.create", { actorId: user.id, target: u.id, details: { role: body.role } });
    return { id: u.id };
  }
  if (body.action === "access") {
    await db().$transaction([db().accountAccess.deleteMany({ where: { userId: body.userId } }), db().accountAccess.createMany({ data: body.accountIds.map((accountId) => ({ userId: body.userId, accountId })) })]);
    await audit("team.access", { actorId: user.id, target: body.userId, details: { accounts: body.accountIds.length } });
    return { ok: true };
  }
  if (body.userId === user.id) throw new HttpError(400, "You can't disable yourself");
  await db().user.update({ where: { id: body.userId }, data: { disabled: body.disabled } });
  if (body.disabled) await db().session.deleteMany({ where: { userId: body.userId } });
  await audit("team.disable", { actorId: user.id, target: body.userId, details: { disabled: body.disabled } });
  return { ok: true };
});
