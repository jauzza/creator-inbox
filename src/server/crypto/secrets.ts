import { createCipheriv, createDecipheriv, randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { env } from "../env";
import { db } from "../db";

/**
 * Secrets (provider/AI/Telegram keys) are encrypted with AES-256-GCM using MASTER_KEY,
 * which lives in the environment, never in the database. Plaintext is never returned to the browser.
 */
function masterKey(): Buffer {
  const raw = env().MASTER_KEY;
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new Error("MASTER_KEY must be 32 bytes, base64 encoded");
  return buf;
}

export function encrypt(plaintext: string, aad: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", masterKey(), iv);
  cipher.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return { ciphertext: ct.toString("base64"), iv: iv.toString("base64"), authTag: cipher.getAuthTag().toString("base64") };
}

export function decrypt(enc: { ciphertext: string; iv: string; authTag: string }, aad: string): string {
  const decipher = createDecipheriv("aes-256-gcm", masterKey(), Buffer.from(enc.iv, "base64"));
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(Buffer.from(enc.authTag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(enc.ciphertext, "base64")), decipher.final()]).toString("utf8");
}

export const SECRET_IDS = ["messaging.onlyfansapi_com", "messaging.webhook_signing", "ai.primary", "ai.alternate", "telegram.bot"] as const;
export type SecretId = (typeof SECRET_IDS)[number];

export async function putSecret(id: SecretId, value: string) {
  const enc = encrypt(value, id); // secret id bound as AAD: ciphertext cannot be swapped between slots
  await db().secret.upsert({ where: { id }, create: { id, ...enc }, update: { ...enc } });
}

export async function getSecret(id: SecretId): Promise<string | null> {
  const row = await db().secret.findUnique({ where: { id } });
  if (!row) return null;
  return decrypt(row, id);
}

export async function deleteSecret(id: SecretId) {
  await db().secret.deleteMany({ where: { id } });
}

/** Metadata safe to show in the UI: whether a value is set and when. Never the value or a fragment. */
export async function secretStatus(id: SecretId) {
  const row = await db().secret.findUnique({ where: { id }, select: { updatedAt: true } });
  return { set: !!row, updatedAt: row?.updatedAt ?? null };
}

export function sha256(s: string) {
  return createHash("sha256").update(s).digest("hex");
}

export function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Replace anything that looks like a credential before it reaches logs, audit rows or error messages. */
export function redact(input: string): string {
  return input
    .replace(/(bearer\s+)[A-Za-z0-9._\-~+/=]{8,}/gi, "$1[redacted]")
    .replace(/\b(sk|ofapi|key|tok)[-_][A-Za-z0-9_\-]{8,}/gi, "[redacted]")
    .replace(/bot\d{5,}:[A-Za-z0-9_-]{20,}/g, "bot[redacted]")
    .replace(/("?(api[_-]?key|authorization|password|token|secret)"?\s*[:=]\s*)"?[^"\s,}]{4,}"?/gi, "$1[redacted]");
}
