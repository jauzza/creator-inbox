import { describe, it, expect } from "vitest";
import { writeFileSync } from "node:fs";
import { OfflineRulesProvider } from "@/server/ai/offline";
import { runReplyPipeline } from "@/server/ai/pipeline";
import { triage } from "@/server/scoring/triage";
import { CATALOGS, CREATORS, SCENARIOS } from "@/server/evals/chat-scenarios";
import { scoreReply, summarize, type QualityRow } from "@/server/evals/chat-quality";
import { scenarioContext } from "./helpers/scenario";

const HUMAN = new Set(["explicit_request", "billing_dispute", "safety", "human_request", "complaint", "opt_out"]);

async function runAll() {
  const rows: QualityRow[] = [];
  for (const s of SCENARIOS) {
    const style = CREATORS[s.creator];
    const latest = s.transcript.filter((m) => m.direction === "INBOUND").map((m) => m.body).join(" ");
    if (triage(latest).some((h) => HUMAN.has(h.category))) {
      rows.push(scoreReply(s, CATALOGS[s.creator], { action: "HANDOFF", reply: "" }, style));
      continue;
    }
    const ctx = scenarioContext(s);
    const r = await runReplyPipeline(new OfflineRulesProvider(), "offline-rules-v1", { maxOutputTokens: 600, temperature: null, topP: null, thinking: "disabled", timeoutMs: 5000 }, ctx, { maxRewrites: 1, recentOutbound: s.transcript.filter((m) => m.direction === "OUTBOUND").map((m) => m.body) });
    rows.push(scoreReply(s, CATALOGS[s.creator], r.output ?? { action: "ERROR", reply: "" }, style));
  }
  return rows;
}

describe("chat quality (offline sample AI, 32 original scenarios)", () => {
  it("meets the naturalness and offer-timing bar", async () => {
    const rows = await runAll();
    const sum = summarize(rows);
    if (process.env.CHAT_QUALITY_OUT) writeFileSync(process.env.CHAT_QUALITY_OUT, JSON.stringify({ sum, rows }, null, 2));
    console.log("chat-quality summary", JSON.stringify(sum));
    expect(sum.scenarios).toBe(SCENARIOS.length);
    if (process.env.CHAT_QUALITY_BASELINE) return; // measuring only
    expect(sum.unpromptedOfferPct).toBe(0);
    expect(sum.missedOffers).toBe(0);
    expect(sum.pushedDeclinedOrOwned).toBe(0);
    expect(sum.genericPct).toBe(0);
    expect(sum.narrationPct).toBe(0);
    expect(sum.styleMissPct).toBe(0);
    expect(sum.questionStreakPct).toBeLessThanOrEqual(10);
    expect(sum.tooLongPct).toBeLessThanOrEqual(10);
    expect(sum.handoffCorrect).toBe("2/2");
  });
});
