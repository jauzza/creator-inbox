import { NextResponse } from "next/server";
import { z } from "zod";
import { api, clientIp } from "@/server/http";
import { db } from "@/server/db";
import { verifyPassword } from "@/server/auth/password";
import { createSession, cookieOptions, SESSION_COOKIE } from "@/server/auth/session";
import { loginBlocked, recordLogin } from "@/server/auth/throttle";
import { HttpError } from "@/server/auth/access";
import { audit } from "@/server/audit";

import { hashPassword } from "@/server/auth/password";

// Real dummy hash so unknown emails cost the same argon2 verification as wrong passwords.
let dummy: Promise<string> | null = null;
const dummyHash = () => (dummy ??= hashPassword("dummy-password-for-timing-only"));

export const POST = api({ auth: "none", body: z.object({ email: z.string().email().max(200), password: z.string().min(1).max(256) }) }, async ({ body, req }) => {
  const email = body.email.toLowerCase();
  const ip = clientIp(req);
  if (await loginBlocked(email, ip)) throw new HttpError(429, "Too many failed attempts. Wait 15 minutes and try again.");
  const user = await db().user.findUnique({ where: { email } });
  const ok = await verifyPassword(user?.passwordHash ?? (await dummyHash()), body.password);
  if (!user || !ok || user.disabled) {
    await recordLogin(email, ip, false);
    throw new HttpError(401, "Email or password is incorrect");
  }
  await recordLogin(email, ip, true);
  const s = await createSession(user.id, req.headers.get("user-agent") ?? undefined);
  await audit("auth.login", { actorId: user.id });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, s.token, cookieOptions(s.maxAge));
  return res;
});
