import type { ReplyContext } from "@/server/ai/prompt";
import { CATALOGS, CREATORS, type ChatScenario } from "@/server/evals/chat-scenarios";

/** Build the model context for a scenario exactly as the app would (no database needed). */
export function scenarioContext(s: ChatScenario): ReplyContext {
  const style = CREATORS[s.creator];
  const purchased = new Set((s.state?.purchased ?? []).map((t) => t.toLowerCase()));
  return {
    style,
    facts: style.publicFacts,
    catalog: CATALOGS[s.creator].map((c, i) => ({ id: `cat${i}`, title: c.title, description: c.description, priceCents: c.priceCents, priceConfirmed: true, alreadyPurchased: purchased.has(c.title.toLowerCase()) })),
    summary: null,
    customerPreferences: s.state?.remembered ?? [],
    triageNotes: [],
    isFirstAiMessage: !s.transcript.some((m) => m.direction === "OUTBOUND"),
    messages: s.transcript.map((m, i) => ({ direction: m.direction, body: m.body, at: `t${i}` })),
  };
}
