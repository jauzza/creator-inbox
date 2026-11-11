import { NextResponse } from "next/server";
import { z } from "zod";
import { api } from "@/server/http";
import { db } from "@/server/db";
import { hashPassword, passwordProblems } from "@/server/auth/password";
import { createSession, cookieOptions, SESSION_COOKIE } from "@/server/auth/session";
import { HttpError } from "@/server/auth/access";
import { audit } from "@/server/audit";

/**
 * First-run owner creation in the browser. Only allowed while NO users exist AND the request is a
 * direct local request (localhost Host, no proxy headers). On a VPS, use `npm run user:create`.
 */
function isLocal(req: Request) {
  const host = (req.headers.get("host") ?? "").split(":")[0];
  return ["localhost", "127.0.0.1", "[::1]"].includes(host) && !req.headers.get("x-forwarded-for");
}

export const GET = api({ auth: "none" }, async ({ req }) => ({ needsSetup: (await db().user.count()) === 0, allowedHere: isLocal(req) }));

export const POST = api(
  { auth: "none", body: z.object({ email: z.string().email().max(200), name: z.string().min(1).max(80), password: z.string().max(256) }) },
  async ({ body, req }) => {
    if (!isLocal(req)) throw new HttpError(403, "First-run setup is only available on localhost. On a server, run: npm run user:create");
    const problem = passwordProblems(body.password);
    if (problem) throw new HttpError(400, problem);
    const user = await db().$transaction(async (tx) => {
      if ((await tx.user.count()) > 0) throw new HttpError(409, "Setup already completed");
      return tx.user.create({ data: { email: body.email.toLowerCase(), name: body.name, role: "OWNER", passwordHash: await hashPassword(body.password) } });
    });
    await audit("auth.setup_owner", { actorId: user.id });
    const s = await createSession(user.id);
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, s.token, cookieOptions(s.maxAge));
    return res;
  },
);
