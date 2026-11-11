/**
 * Deterministic triage that runs BEFORE any model call. It decides whether a message is
 * outside the AI's supported scope and must go to a human. The model can also request a
 * handoff, but it can never override a handoff decided here.
 */

export type TriageCategory =
  | "explicit_request"
  | "safety"
  | "human_request"
  | "opt_out"
  | "complaint"
  | "billing_dispute"
  | "ai_question"
  | "purchase_interest";

export type TriageHit = { category: TriageCategory; handoff: boolean; priority: number; evidence: string };

const rules: { category: TriageCategory; handoff: boolean; priority: number; re: RegExp }[] = [
  { category: "safety", handoff: true, priority: 100, re: /\b(kill myself|suicid|self[- ]?harm|i'?m (1[0-7]|under ?age)|years? old and in (middle|high) school|threat(en)?|i know where you live)\b/i },
  { category: "explicit_request", handoff: true, priority: 60, re: /\b(nude|nudes|naked|nsfw|explicit|sext|sexting|horny|dick|cock|pussy|boobs|tits|cum|fuck me|role ?play|dirty talk|send (me )?(something )?(spicy|sexy)|xxx)\b/i },
  { category: "opt_out", handoff: true, priority: 70, re: /\b(stop (messaging|texting|sending)|unsubscribe|leave me alone|don'?t (message|text) me|no more messages)\b/i },
  { category: "billing_dispute", handoff: true, priority: 85, re: /\b(refund|charge ?back|charged twice|double charged|dispute|scam(med)?|didn'?t (get|receive) (what|the) i paid|money back|billed but|charged but|nothing (was )?unlocked|(didn'?t|did not|doesn'?t) unlock|paid (for it )?but)\b/i },
  { category: "complaint", handoff: true, priority: 75, re: /\b(complain|complaint|unacceptable|terrible service|ripped off|disappointed|report (you|this))\b/i },
  { category: "human_request", handoff: true, priority: 80, re: /\b(real person|talk to (a )?(human|person|you directly)|actual (person|human)|(speak|talk) to (her|you|the creator) (directly|personally|herself)|is (she|this) really (her|you)|not (a|the) team)\b/i },
  { category: "ai_question", handoff: false, priority: 40, re: /\b(are you (a )?(bot|ai|robot|real)|is this (a )?(bot|ai|automated)|chat ?gpt|auto(mated)? repl)/i },
  { category: "purchase_interest", handoff: false, priority: 55, re: /\b(i('?d| would)? (want|like) to (buy|purchase|get)|how (do|can) i (buy|pay|unlock|order)|i'?ll take it|send (me )?the (link|price)|sign me up)\b/i },
];

export function triage(text: string): TriageHit[] {
  const hits: TriageHit[] = [];
  for (const r of rules) {
    const m = text.match(r.re);
    if (m) hits.push({ category: r.category, handoff: r.handoff, priority: r.priority, evidence: m[0].slice(0, 80) });
  }
  return hits.sort((a, b) => b.priority - a.priority);
}

export const CATEGORY_LABEL: Record<TriageCategory | "model_handoff" | "intent_threshold" | "ai_failure" | "budget" | "uncertain_send", string> = {
  explicit_request: "Asked for explicit content, which the AI won't answer",
  safety: "Possible safety concern",
  human_request: "Asked to talk to a real person",
  opt_out: "Asked you to stop messaging",
  complaint: "Unhappy about something",
  billing_dispute: "Billing or refund question",
  ai_question: "Asked whether replies are AI-assisted",
  purchase_interest: "Wants to buy something",
  model_handoff: "The AI wasn't sure how to answer",
  intent_threshold: "Very interested in buying",
  ai_failure: "The AI couldn't write a safe reply",
  budget: "AI spending limit reached",
  uncertain_send: "Couldn't confirm a reply was delivered",
};
