import { db } from "../db";
import type { SessionUser } from "./session";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Creator-account isolation: owners see every account; operators only accounts granted to them. */
export async function accessibleAccountIds(user: Pick<SessionUser, "id" | "role">): Promise<string[]> {
  if (user.role === "OWNER") return (await db().creatorAccount.findMany({ select: { id: true } })).map((a) => a.id);
  return (await db().accountAccess.findMany({ where: { userId: user.id }, select: { accountId: true } })).map((a) => a.accountId);
}

export async function assertAccountAccess(user: Pick<SessionUser, "id" | "role">, accountId: string) {
  if (user.role === "OWNER") return;
  const ok = await db().accountAccess.findUnique({ where: { userId_accountId: { userId: user.id, accountId } } });
  if (!ok) throw new HttpError(404, "Not found");
}

export async function assertConversationAccess(user: Pick<SessionUser, "id" | "role">, conversationId: string) {
  const c = await db().conversation.findUnique({ where: { id: conversationId }, select: { accountId: true } });
  if (!c) throw new HttpError(404, "Not found");
  await assertAccountAccess(user, c.accountId);
  return c;
}

export function requireOwner(user: Pick<SessionUser, "role">) {
  if (user.role !== "OWNER") throw new HttpError(403, "Only the owner can change this setting");
}
