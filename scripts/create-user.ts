import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { db } from "../src/server/db";
import { hashPassword, passwordProblems } from "../src/server/auth/password";

// Usage: npm run user:create -- --email you@example.com --role owner|operator [--name "Name"]
// The password is read from the terminal (or USER_PASSWORD env for automation); it is never logged.
async function main() {
  const args = process.argv.slice(2);
  const get = (k: string) => {
    const i = args.indexOf(`--${k}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const email = get("email")?.toLowerCase();
  const role = (get("role") ?? "operator").toUpperCase();
  if (!email || !["OWNER", "OPERATOR"].includes(role)) throw new Error("Usage: --email <email> --role owner|operator");
  let password = process.env.USER_PASSWORD;
  if (!password) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    password = await rl.question("Password (min 12 chars): ");
    rl.close();
  }
  const problem = passwordProblems(password);
  if (problem) throw new Error(problem);
  const user = await db().user.upsert({
    where: { email },
    create: { email, name: get("name") ?? email.split("@")[0], role: role as "OWNER" | "OPERATOR", passwordHash: await hashPassword(password) },
    update: { role: role as "OWNER" | "OPERATOR", passwordHash: await hashPassword(password) },
  });
  console.log(`User ${user.email} (${user.role}) ready.`);
  await db().$disconnect();
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
