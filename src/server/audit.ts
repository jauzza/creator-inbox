import { db, type Tx } from "./db";
import { redact } from "./crypto/secrets";

export async function audit(
  action: string,
  opts: { actorId?: string | null; actorKind?: "user" | "system" | "worker"; target?: string; details?: Record<string, unknown>; tx?: Tx } = {},
) {
  const details = opts.details ? JSON.parse(redact(JSON.stringify(opts.details))) : {};
  await (opts.tx ?? db()).auditLog.create({
    data: { action, actorId: opts.actorId ?? null, actorKind: opts.actorKind ?? (opts.actorId ? "user" : "system"), target: opts.target, details },
  });
}

/** Structured, redacted console logging for worker/server. Never pass message bodies or secrets. */
export function log(level: "info" | "warn" | "error", msg: string, extra?: Record<string, unknown>) {
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...(extra ?? {}) });
  console[level === "info" ? "log" : level](redact(line));
}
