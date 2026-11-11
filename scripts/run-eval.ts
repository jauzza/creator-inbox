import "dotenv/config";
import { createEvalRun, executeEvalRun, evalSummary } from "../src/server/evals/runner";
import { seedEvalCases } from "../src/server/seed";
import { db } from "../src/server/db";

// Usage: npm run eval -- [primary|alternate]
async function main() {
  const slot = (process.argv[2] as "primary" | "alternate") ?? "primary";
  await seedEvalCases();
  const run = await createEvalRun(slot, `cli ${slot}`);
  await executeEvalRun(run.id);
  console.log(JSON.stringify({ run: run.label, model: run.model, ...(await evalSummary(run.id)) }, null, 2));
  await db().$disconnect();
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
