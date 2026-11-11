import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { z, ZodError } from "zod";
import { getSessionUser, SESSION_COOKIE, type SessionUser } from "./auth/session";
import { HttpError, requireOwner } from "./auth/access";
import { env } from "./env";
import { log } from "./audit";

type Opts<S extends z.ZodType | undefined> = { auth?: "user" | "owner" | "none"; body?: S; csrf?: boolean };
type Ctx<S> = { user: SessionUser; body: S extends z.ZodType ? z.infer<S> : undefined; params: Record<string, string>; req: NextRequest };

/** Same-origin check for state-changing requests (CSRF layer 1); token check is layer 2. */
export function originAllowed(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const allowed = new Set([new URL(env().APP_URL).origin]);
  const host = req.headers.get("host");
  if (host) {
    allowed.add(`http://${host}`);
    allowed.add(`https://${host}`);
  }
  return allowed.has(origin);
}

export function api<S extends z.ZodType | undefined = undefined>(
  opts: Opts<S>,
  handler: (ctx: Ctx<S>) => Promise<unknown>,
) {
  return async (req: NextRequest, routeCtx: { params: Promise<Record<string, string>> }) => {
    try {
      const params = (await routeCtx?.params) ?? {};
      const mutating = req.method !== "GET" && req.method !== "HEAD";
      let user: SessionUser | null = null;
      if (opts.auth !== "none") {
        const token = (await cookies()).get(SESSION_COOKIE)?.value;
        user = await getSessionUser(token);
        if (!user) throw new HttpError(401, "Please sign in");
        if (opts.auth === "owner") requireOwner(user);
      }
      if (mutating && opts.csrf !== false) {
        if (!originAllowed(req)) throw new HttpError(403, "Cross-origin request blocked");
        if (user && req.headers.get("x-csrf-token") !== user.csrfToken) throw new HttpError(403, "Invalid CSRF token; reload the page");
      }
      let body: unknown = undefined;
      if (opts.body) {
        const json = await req.json().catch(() => {
          throw new HttpError(400, "Body must be JSON");
        });
        body = opts.body.parse(json);
      }
      const result = await handler({ user: user as SessionUser, body: body as any, params, req });
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true });
    } catch (e) {
      if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
      if (e instanceof ZodError)
        return NextResponse.json({ error: "Invalid input", issues: e.issues.map((i) => `${i.path.join(".")}: ${i.message}`) }, { status: 400 });
      log("error", "api_error", { path: req.nextUrl.pathname, error: e instanceof Error ? e.message : String(e) });
      return NextResponse.json({ error: "Something went wrong. Check Activity → Troubleshooting." }, { status: 500 });
    }
  };
}

export function clientIp(req: NextRequest) {
  return (req.headers.get("x-forwarded-for")?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "local").trim();
}
