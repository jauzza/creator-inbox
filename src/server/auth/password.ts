import { hash, verify } from "@node-rs/argon2";

// argon2id with OWASP-recommended baseline parameters (19 MiB, t=2, p=1).
const opts = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

export function hashPassword(pw: string) {
  return hash(pw, opts);
}
export async function verifyPassword(stored: string, pw: string) {
  try {
    return await verify(stored, pw);
  } catch {
    return false;
  }
}
export function passwordProblems(pw: string): string | null {
  if (pw.length < 12) return "Password must be at least 12 characters.";
  if (pw.length > 256) return "Password is too long.";
  return null;
}
