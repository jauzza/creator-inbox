import type { Rules } from "../automation/settings";

export type Signal = { signal: string; weight: number; evidence: string };

const PRICE = /\b(how much|price|pricing|cost|\$\s?\d+|\d+\s?(usd|dollars|euros?)|discount|bundle price)\b/i;
const CATALOG = /\b(what('?s| is) (new|in)|catalog|menu|your (sets?|collection|bundles?|content list)|do you (have|sell|offer)|which (set|bundle)|subscription (tiers?|options?)|what do i get)\b/i;
const INTEREST = /\b(i('?d| would)? (want|like|love) to (buy|purchase|get|unlock)|i'?ll (take|buy) it|how (do|can) i (buy|pay|unlock)|send (me )?(the )?(link|offer)|interested in (buying|the))\b/i;
const DECLINE = /\b(not interested|no thanks|no thank you|too expensive|can'?t afford|maybe later|pass on (this|that)|don'?t want (it|to buy))\b/i;

/** Score a single inbound message. Only text the customer wrote; no inference about wealth or vulnerability. */
export function scoreMessage(text: string, w: Rules["scoring"]["weights"]): Signal[] {
  const out: Signal[] = [];
  const pick = (re: RegExp) => text.match(re)?.[0]?.slice(0, 80) ?? "";
  if (PRICE.test(text)) out.push({ signal: "price_question", weight: w.priceQuestion, evidence: pick(PRICE) });
  if (CATALOG.test(text)) out.push({ signal: "catalog_question", weight: w.catalogQuestion, evidence: pick(CATALOG) });
  if (INTEREST.test(text)) out.push({ signal: "purchase_interest", weight: w.purchaseInterest, evidence: pick(INTEREST) });
  if (DECLINE.test(text)) out.push({ signal: "decline", weight: -w.declineSignal, evidence: pick(DECLINE) });
  return out;
}

/** Exponential decay toward 0 with the configured half-life. */
export function decay(score: number, since: Date | null, now: Date, halfLifeHours: number) {
  if (!since) return score;
  const hours = Math.max(0, (now.getTime() - since.getTime()) / 3_600_000);
  return score * Math.pow(0.5, hours / halfLifeHours);
}

export function nextIntent(opts: {
  current: number;
  updatedAt: Date | null;
  now: Date;
  signals: Signal[];
  hasPriorVerifiedPurchase: boolean;
  messagesLast24h: number;
  rules: Rules["scoring"];
}) {
  const base = decay(opts.current, opts.updatedAt, opts.now, opts.rules.halfLifeHours);
  let delta = opts.signals.reduce((s, x) => s + x.weight, 0);
  const extra: Signal[] = [];
  // Prior purchase is a modest boost only when combined with a current buying signal; history alone ≠ current intent.
  if (opts.hasPriorVerifiedPurchase && opts.signals.some((s) => s.weight > 0)) {
    extra.push({ signal: "prior_verified_purchase", weight: opts.rules.weights.priorPurchase, evidence: "Verified purchase on record" });
    delta += opts.rules.weights.priorPurchase;
  }
  // Engagement adds at most one small bump, and only alongside another positive signal.
  if (opts.messagesLast24h >= 3 && opts.signals.some((s) => s.weight > 0)) {
    extra.push({ signal: "recent_engagement", weight: opts.rules.weights.recentEngagement, evidence: `${opts.messagesLast24h} messages in 24h` });
    delta += opts.rules.weights.recentEngagement;
  }
  const score = Math.max(0, Math.min(100, base + delta));
  return { score: Math.round(score * 10) / 10, delta, signals: [...opts.signals, ...extra] };
}
