import { db } from "../db";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_EMAIL = 5;
const MAX_PER_IP = 20;

export async function loginBlocked(email: string, ip: string): Promise<boolean> {
  const since = new Date(Date.now() - WINDOW_MS);
  const [byEmail, byIp] = await Promise.all([
    db().loginAttempt.count({ where: { key: `email:${email}`, success: false, createdAt: { gte: since } } }),
    db().loginAttempt.count({ where: { key: `ip:${ip}`, success: false, createdAt: { gte: since } } }),
  ]);
  return byEmail >= MAX_PER_EMAIL || byIp >= MAX_PER_IP;
}

export async function recordLogin(email: string, ip: string, success: boolean) {
  await db().loginAttempt.createMany({ data: [{ key: `email:${email}`, success }, { key: `ip:${ip}`, success }] });
  if (success) await db().loginAttempt.deleteMany({ where: { key: `email:${email}`, success: false } });
}
