import { randomBytes } from "node:crypto";
import { db } from "../db";
import { sha256 } from "../crypto/secrets";
import { env } from "../env";
import type { Role } from "@/generated/prisma/client";

export const SESSION_COOKIE = "ci_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

export type SessionUser = { id: string; email: string; name: string; role: Role; csrfToken: string; sessionId: string; onboardedAt?: Date | null; tourCompletedAt?: Date | null };

export async function createSession(userId: string, userAgent?: string) {
  const token = randomBytes(32).toString("base64url");
  const csrfToken = randomBytes(24).toString("base64url");
  await db().session.create({
    data: { id: sha256(token), userId, csrfToken, expiresAt: new Date(Date.now() + SESSION_TTL_MS), userAgent: userAgent?.slice(0, 200) },
  });
  return { token, csrfToken, maxAge: SESSION_TTL_MS / 1000 };
}

export async function getSessionUser(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  const s = await db().session.findUnique({ where: { id: sha256(token) }, include: { user: true } });
  if (!s || s.expiresAt < new Date() || s.user.disabled) return null;
  if (Date.now() - s.lastSeenAt.getTime() > 60_000) {
    await db().session.update({ where: { id: s.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
  }
  return { id: s.user.id, email: s.user.email, name: s.user.name, role: s.user.role, csrfToken: s.csrfToken, sessionId: s.id, onboardedAt: s.user.onboardedAt, tourCompletedAt: s.user.tourCompletedAt };
}

export async function destroySession(token: string) {
  await db().session.deleteMany({ where: { id: sha256(token) } });
}

export function cookieOptions(maxAge: number) {
  return { httpOnly: true, sameSite: "lax" as const, secure: env().COOKIE_SECURE === "true", path: "/", maxAge };
}
