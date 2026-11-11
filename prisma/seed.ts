import "dotenv/config";
import { seedBase, seedSimulator, seedEvalCases } from "../src/server/seed";
import { db } from "../src/server/db";

async function main() {
  await seedBase({ ownerEmail: process.env.SEED_OWNER_EMAIL, ownerPassword: process.env.SEED_OWNER_PASSWORD || undefined });
  // Practice (simulator) accounts are opt-in: a real installation starts empty and is set up by its owner.
  const practice = process.env.SEED_PRACTICE === "1" ? await seedSimulator() : null;
  const n = await seedEvalCases();
  const users = await db().user.count();
  console.log(`Seeded: ${practice ? `practice account "${practice.displayName}", ` : ""}${n} eval cases, ${users} user(s).`);
  if (users === 0) console.log("No users yet. Create the owner with: npm run user:create -- --email you@example.com --role owner");
  await db().$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
