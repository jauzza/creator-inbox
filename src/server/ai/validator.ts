import { MAX_CHARS, type Style } from "./style";
import type { CatalogFact, ReplyOutput } from "./prompt";

export type Issue = { code: string; severity: "block" | "warn"; detail: string };

const EXPLICIT = /\b(nude|nudes|naked|nsfw|sext|horny|dick|cock|pussy|boobs|tits|cum|xxx|explicit pics?|dirty talk)\b/i;
const DENIAL = /\b(i'?m not (a )?(bot|ai|robot)|not an ai|this is (really|actually|100%) me|(i'?m )?typing this (myself|personally)|no bots? here|definitely (a )?real (person|human)|i personally wrote)\b/i;
const LIVE_ACTIVITY = /\b(i'?m (online|in bed|at home|home now|awake|nearby|near you|free now)|just (got home|woke up|got out of)|right now i'?m|i'?ll be live|i'?m live)\b/i;
const DELIVERY = /\b(i (just )?sent (it|you|that)|check your (messages|inbox|dms?)|(it'?s|it has been) (sent|delivered|unlocked)|you'?ve been charged)\b/i;
const PRESSURE = /\b(only today|last chance|limited time|before it'?s gone|only \d+ left|exclusive(ly)? for you|special discount|hurry|don'?t miss out|you'?ll regret)\b/i;
const PROMISE = /\b(i promise|i'?ll (make|film|shoot|record) (you|something)|custom (video|content) for you|we can meet|call you|facetime)\b/i;
const GENERIC = /\b(as an ai|how (can|may) i (assist|help) you today|i'?m here to help|dear (valued )?customer|i hope this message finds you)\b/i;
const EMOJI = /\p{Extended_Pictographic}/u;
const MONEY = /(?:\$|€|£)\s?(\d+(?:[.,]\d{1,2})?)|(\d+(?:[.,]\d{1,2})?)\s?(?:usd|dollars|euros?|eur)\b/gi;

function trigrams(s: string) {
  const w = s.toLowerCase().match(/[a-z0-9']+/g) ?? [];
  const out = new Set<string>();
  for (let i = 0; i + 2 < w.length; i++) out.add(w.slice(i, i + 3).join(" "));
  return out;
}
export function similarity(a: string, b: string) {
  const A = trigrams(a), B = trigrams(b);
  if (A.size === 0 || B.size === 0) return a.trim().toLowerCase() === b.trim().toLowerCase() ? 1 : 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / Math.min(A.size, B.size);
}

export function validateReply(
  out: ReplyOutput,
  ctx: { style: Style; catalog: CatalogFact[]; recentOutbound: string[]; latestInbound: string },
): Issue[] {
  const issues: Issue[] = [];
  const r = out.reply.trim();
  const needsText = out.action === "ANSWER" || out.action === "CLARIFY" || out.action === "ACKNOWLEDGE";
  if (needsText && !r) issues.push({ code: "empty_reply", severity: "block", detail: "Action needs a reply but the text is empty" });
  if (!r) return issues;

  if (EXPLICIT.test(r)) issues.push({ code: "out_of_scope", severity: "block", detail: "Reply contains explicit content" });
  if (DENIAL.test(r)) issues.push({ code: "denies_automation", severity: "block", detail: "Reply denies or hides AI assistance" });
  if (LIVE_ACTIVITY.test(r)) issues.push({ code: "invented_activity", severity: "block", detail: `Claims live activity: "${r.match(LIVE_ACTIVITY)![0]}"` });
  if (DELIVERY.test(r)) issues.push({ code: "claims_delivery", severity: "block", detail: "Claims something was sent, delivered or charged" });
  if (PRESSURE.test(r)) issues.push({ code: "pressure", severity: "block", detail: `Pressure/scarcity wording: "${r.match(PRESSURE)![0]}"` });
  if (PROMISE.test(r)) issues.push({ code: "creator_promise", severity: "block", detail: "Makes a promise on the creator's behalf" });

  const confirmed = new Set(ctx.catalog.filter((c) => c.priceConfirmed && c.priceCents != null).map((c) => c.priceCents! / 100));
  for (const m of r.matchAll(MONEY)) {
    const v = Number((m[1] ?? m[2]).replace(",", "."));
    if (!confirmed.has(v)) issues.push({ code: "unsupported_price", severity: "block", detail: `Price ${m[0].trim()} is not a confirmed catalog price` });
  }
  for (const c of ctx.catalog.filter((c) => c.alreadyPurchased)) {
    if (r.toLowerCase().includes(c.title.toLowerCase()) && /\b(want|get|buy|unlock|send|grab)\b/i.test(r))
      issues.push({ code: "offers_purchased_item", severity: "block", detail: `Offers "${c.title}", which the customer already bought` });
  }

  const max = MAX_CHARS[ctx.style.replyLength];
  if (r.length > max) issues.push({ code: "too_long", severity: "warn", detail: `${r.length} chars; limit for "${ctx.style.replyLength}" is ${max}` });
  for (const prev of ctx.recentOutbound.slice(-3)) {
    if (similarity(r, prev) >= 0.6) {
      issues.push({ code: "repetitive", severity: "warn", detail: "Very similar to a recent reply" });
      break;
    }
  }
  if (GENERIC.test(r)) issues.push({ code: "generic_assistant", severity: "warn", detail: "Generic assistant phrasing" });
  if (ctx.style.emoji === "none" && EMOJI.test(r)) issues.push({ code: "style_emoji", severity: "warn", detail: "Emoji used although style says none" });
  for (const p of ctx.style.avoidPhrases) {
    if (p && r.toLowerCase().includes(p.toLowerCase())) issues.push({ code: "avoid_phrase", severity: "warn", detail: `Uses avoided phrase "${p}"` });
  }
  if ((r.match(/\?/g) ?? []).length > 2) issues.push({ code: "too_many_questions", severity: "warn", detail: "More than two questions" });
  return issues;
}

export const hasBlocking = (issues: Issue[]) => issues.some((i) => i.severity === "block");
