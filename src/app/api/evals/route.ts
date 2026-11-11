import { z } from "zod";
import { api } from "@/server/http";
import { db } from "@/server/db";
import { createEvalRun, evalSummary } from "@/server/evals/runner";
import { enqueue } from "@/server/queue/jobs";
import { seedEvalCases } from "@/server/seed";
import { HttpError } from "@/server/auth/access";

export const GET = api({ auth: "user" }, async ({ req }) => {
  const sp = req.nextUrl.searchParams;
  const a = sp.get("a"), b = sp.get("b");
  const runs = await db().evalRun.findMany({ orderBy: { createdAt: "desc" }, take: 20 });
  const summaries = await Promise.all(runs.map(async (r) => ({ id: r.id, label: r.label, status: r.status, createdAt: r.createdAt, promptVersion: r.promptVersion, styleVersion: r.styleVersion, model: r.model, provider: r.provider, summary: await evalSummary(r.id) })));
  let compare = null;
  if (a && b && a !== b) {
    // Blind comparison: model/prompt names hidden; order shuffled per case.
    const cases = await db().evalCase.findMany({ orderBy: { key: "asc" }, include: { results: { where: { runId: { in: [a, b] } } } } });
    compare = cases
      .filter((c) => c.results.length === 2)
      .map((c) => {
        const shuffled = [...c.results].sort((x, y) => (x.id + c.id < y.id + c.id ? -1 : 1));
        return { caseId: c.id, key: c.key, category: c.category, transcript: c.transcript, expected: c.expected, candidates: shuffled.map((r, i) => ({ resultId: r.id, slot: i === 0 ? "Reply 1" : "Reply 2", action: r.action, body: r.body, error: r.error, autoChecks: r.autoChecks, reviewerScore: r.reviewerScore, preferred: r.preferred })) };
      });
  }
  return { caseCount: await db().evalCase.count(), runs: summaries, compare };
});

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("run"), slot: z.enum(["primary", "alternate"]), label: z.string().max(60).optional() }),
  z.object({ action: z.literal("review"), resultId: z.string(), score: z.number().int().min(1).max(5).nullable(), preferred: z.boolean().nullable(), notes: z.string().max(300).optional() }),
  z.object({ action: z.literal("reseed") }),
]);

export const POST = api({ auth: "user", body }, async ({ body }) => {
  if (body.action === "reseed") return { cases: await seedEvalCases() };
  if (body.action === "review") {
    const r = await db().evalResult.findUniqueOrThrow({ where: { id: body.resultId } });
    if (body.preferred) {
      const sibling = await db().evalResult.findMany({ where: { caseId: r.caseId, id: { not: r.id } } });
      await db().evalResult.updateMany({ where: { id: { in: sibling.map((s) => s.id) } }, data: { preferred: false } });
    }
    await db().evalResult.update({ where: { id: r.id }, data: { reviewerScore: body.score, preferred: body.preferred, reviewerNotes: body.notes } });
    return { ok: true };
  }
  if ((await db().evalCase.count()) === 0) throw new HttpError(400, "No eval cases; click Reseed cases");
  const run = await createEvalRun(body.slot, body.label);
  await db().$transaction((tx) => enqueue(tx, { type: "run_eval", payload: { runId: run.id }, maxAttempts: 1 }));
  return { runId: run.id };
});
