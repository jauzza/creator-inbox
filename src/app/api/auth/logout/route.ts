import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { api } from "@/server/http";
import { destroySession, SESSION_COOKIE } from "@/server/auth/session";

export const POST = api({ auth: "user" }, async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) await destroySession(token);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
});
