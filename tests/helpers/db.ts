import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PrismaPGlite } from "pglite-prisma-adapter";
import { PrismaClient } from "@/generated/prisma/client";
import { setDb } from "@/server/db";
import { seedBase, seedSimulator } from "@/server/seed";
import { setTransport } from "@/server/net/safeFetch";

const dir = path.resolve(import.meta.dirname, "../../prisma/migrations");
const migrations = readdirSync(dir)
  .filter((d) => /^\d+_/.test(d))
  .sort()
  .map((d) => readFileSync(path.join(dir, d, "migration.sql"), "utf8"));

/** Fresh in-process Postgres (PGlite) with the real migrations applied. */
export async function freshDb(opts: { seed?: boolean } = {}) {
  const pg = new PGlite();
  for (const sql of migrations) await pg.exec(sql);
  const client = new PrismaClient({ adapter: new PrismaPGlite(pg) });
  setDb(client);
  // Any accidental network call in tests fails loudly.
  setTransport(async (req) => {
    throw new Error(`Unexpected network call in test: ${req.url}`);
  });
  if (opts.seed !== false) {
    await seedBase();
    await seedSimulator();
    await client.job.deleteMany({}); // tests start from an empty queue
  }
  return { client, pg };
}

export async function setRules(client: PrismaClient, patch: Record<string, unknown>) {
  const { DEFAULT_RULES } = await import("@/server/automation/settings");
  const row = await client.automationSettings.findUniqueOrThrow({ where: { id: "global" } });
  await client.automationSettings.update({ where: { id: "global" }, data: { rules: { ...DEFAULT_RULES, ...(row.rules as object), ...patch } } });
}

export async function simConversation(client: PrismaClient, ext = "sim_fan_sam") {
  return client.conversation.findFirstOrThrow({ where: { externalChatId: ext }, include: { account: true, customer: true } });
}

/** Make every pending job due now and run the queue until it is empty. */
export async function runQueue(client: PrismaClient, rounds = 5) {
  const { drain } = await import("@/server/queue/worker");
  let total = 0;
  for (let i = 0; i < rounds; i++) {
    await client.job.updateMany({ where: { status: "PENDING" }, data: { runAt: new Date(Date.now() - 1000) } });
    const n = await drain();
    total += n;
    if (n === 0) break;
  }
  return total;
}

export const noTimingRestrictions = {
  activeHours: { enabled: false, timezone: "UTC", days: [0, 1, 2, 3, 4, 5, 6], start: "00:00", end: "00:00" },
  quietHours: { enabled: false, start: "00:00", end: "00:00" },
  queue: { concurrency: 1, accountMinIntervalSec: 0, cooldownAfterSendSec: 0 },
};
