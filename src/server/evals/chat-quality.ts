import type { ChatScenario, Catalog } from "./chat-scenarios";

/**
 * Automatic chat-quality checks. These measure the things the dataset research flagged as the
 * difference between natural DMs and "AI-sounding" chat: length relative to the subscriber,
 * question streaks, narration, generic phrasing, repetition, and offer timing.
 * They are proxies, not a judgement of writing quality — read the replies too.
 */
export type QualityRow = {
  id: string;
  reply: string;
  action: string;
  chars: number;
  subChars: number;
  tooLong: boolean;
  question: boolean;
  questionStreak: boolean;
  mentionsItem: boolean;
  unpromptedOffer: boolean;
  missedOffer: boolean;
  pushesDeclinedOrOwned: boolean;
  generic: boolean;
  narration: boolean;
  styleMiss: boolean;
  waitOk: boolean | null;
  handoffOk: boolean | null;
};

const GENERIC = /\b(as an ai|happy to help|how (can|may) i (assist|help) you|i'?m here to help|feel free to|don'?t hesitate|let me know if you have any (other )?questions|i hope this (message )?finds you|is there anything else)\b/i;
const EMOJI = /\p{Extended_Pictographic}/u;

export function itemKeys(title: string) {
  const t = title.toLowerCase();
  const first = t.split(/\s+/).find((w) => w.length >= 5) ?? t;
  return [t, first];
}

export function scoreReply(s: ChatScenario, catalog: Catalog, out: { action: string; reply: string }, styleInfo: { lowercase: boolean; emoji: string }): QualityRow {
  const reply = (out.reply ?? "").trim();
  const low = reply.toLowerCase();
  const lastOut = [...s.transcript].reverse().find((m) => m.direction === "OUTBOUND");
  let burst: string[] = [];
  for (const m of [...s.transcript].reverse()) {
    if (m.direction === "OUTBOUND") break;
    burst.unshift(m.body);
  }
  if (!burst.length) burst = [s.transcript.at(-1)?.body ?? ""];
  const subChars = Math.round(burst.reduce((a, b) => a + b.length, 0) / burst.length);
  const mentioned = catalog.filter((c) => itemKeys(c.title).some((k) => low.includes(k)));
  const mentionsItem = mentioned.length > 0 || /\$\d/.test(reply);
  const avoidSet = new Set([...(s.state?.purchased ?? []), ...(s.state?.declined ?? [])].map((t) => t.toLowerCase()));
  const pushesDeclinedOrOwned = mentioned.some((c) => avoidSet.has(c.title.toLowerCase())) && /\b(want|get|grab|unlock|send|check out|interested|\$)/i.test(reply);
  const handoffExpected = !!s.expectHandoff;
  const sentenceStarts = reply.match(/(^|[.!?]\s+)([A-Za-z])/g) ?? [];
  const styleMiss =
    !!reply &&
    ((styleInfo.lowercase && sentenceStarts.some((x) => /[A-Z]$/.test(x) && !/\bI$/.test(x))) || (styleInfo.emoji === "none" && EMOJI.test(reply)));
  return {
    id: s.id,
    reply,
    action: out.action,
    chars: reply.length,
    subChars,
    tooLong: !!reply && ((subChars < 40 && reply.length > 140) || (reply.length > 120 && reply.length > subChars * 3.5)),
    question: reply.includes("?"),
    questionStreak: reply.includes("?") && !!lastOut && lastOut.body.trim().endsWith("?"),
    mentionsItem,
    unpromptedOffer: s.offer === "none" && !handoffExpected && mentionsItem,
    missedOffer: s.offer === "suggest" && !mentionsItem,
    pushesDeclinedOrOwned,
    generic: GENERIC.test(reply),
    narration: /\*[^*]{2,}\*/.test(reply),
    styleMiss,
    waitOk: s.expectWait ? out.action === "WAIT" || (out.action === "ACKNOWLEDGE" && reply.length <= 30) : null,
    handoffOk: handoffExpected ? out.action === "HANDOFF" : null,
  };
}

export function summarize(rows: QualityRow[]) {
  const n = rows.length;
  const replies = rows.filter((r) => r.reply);
  const pct = (k: keyof QualityRow, base = rows) => Math.round((base.filter((r) => r[k] === true).length / Math.max(1, base.length)) * 100);
  const offerRows = rows.filter((r) => r.unpromptedOffer || r.missedOffer);
  const dupes = replies.length - new Set(replies.map((r) => r.reply.toLowerCase().replace(/[^a-z]/g, ""))).size;
  const lens = replies.map((r) => r.chars).sort((a, b) => a - b);
  const waits = rows.filter((r) => r.waitOk !== null);
  const hand = rows.filter((r) => r.handoffOk !== null);
  return {
    scenarios: n,
    medianChars: lens.length ? lens[Math.floor(lens.length / 2)] : 0,
    tooLongPct: pct("tooLong", replies),
    questionPct: pct("question", replies),
    questionStreakPct: pct("questionStreak", replies),
    unpromptedOfferPct: pct("unpromptedOffer"),
    missedOffers: rows.filter((r) => r.missedOffer).length,
    pushedDeclinedOrOwned: rows.filter((r) => r.pushesDeclinedOrOwned).length,
    genericPct: pct("generic", replies),
    narrationPct: pct("narration", replies),
    styleMissPct: pct("styleMiss", replies),
    duplicateReplies: dupes,
    waitCorrect: `${waits.filter((r) => r.waitOk).length}/${waits.length}`,
    handoffCorrect: `${hand.filter((r) => r.handoffOk).length}/${hand.length}`,
    offerErrors: offerRows.length,
  };
}
