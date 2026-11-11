/**
 * Chat craft: the deterministic layer that makes replies feel like a real DM thread.
 *
 * Built from the dataset research (see RESEARCH.md §8):
 * - Real creator DMs are long-running threads of short turns that arrive in bursts. Synthetic companion
 *   chat (Wifu, PIPPA) is the opposite: ~490-char replies, emoji in every message, a question in most
 *   replies, *narrated actions*. That is the "AI-sounding" pattern we steer away from.
 * - Creator-chatter systems keep a per-fan brief (who they are, what they bought, what works, what to
 *   avoid) and a cooling period between offers (Kassyy card: 6h). We do the same, in code.
 * - Tone ladders (FlirtFlip: gentle / playful / bold, 50–60 chars each) map well onto per-creator presets.
 * No dataset records are copied: every example below is written for this project.
 */
import type { CatalogFact } from "./prompt";

export type Situation =
  | "greeting_new"
  | "greeting_return"
  | "small_talk"
  | "personal_question"
  | "compliment"
  | "reaction"
  | "goodbye"
  | "content_question"
  | "price_question"
  | "buying_interest"
  | "hesitation"
  | "decline"
  | "cant_afford"
  | "ai_question"
  | "meet_request"
  | "live_question";

export type Msg = { direction: "INBOUND" | "OUTBOUND"; body: string; hoursAgo: number };

/** Messages since our last reply: answer them together, not one by one. */
export function latestBurst(msgs: Msg[]) {
  const out: Msg[] = [];
  for (const m of [...msgs].reverse()) {
    if (m.direction === "OUTBOUND") break;
    out.unshift(m);
  }
  return out;
}

const RX = {
  meet: /\b(meet( ?up)?|hang ?out|where do (you|u) live|your address|ur address|come over|call me|facetime|video call|snap(chat)?|whatsapp|your number|ur number|in person|irl)\b/i,
  live: /\b(are|r) (you|u) (online|up|awake|there|home)\b|\bwhat (are|r) (you|u) (doing|up to)( rn| right now| now)?\??$/i,
  ai: /\b(are (you|u)|is this|r u) (a )?(bot|ai|robot|real|automated)\b|\bchat ?gpt\b|\breal person\b/i,
  bye: /^(bye+|night+|good ?night|gn|ttyl|see (ya|you)|later|cya|nighty|sleep well|gotta go)\b/i,
  cantAfford: /\b(money is tight|can'?t afford|cant afford|broke|too expensive|no money|short on cash|tight this month)\b/i,
  decline: /\b(no thanks|no thank (you|u)|not (right )?now|not interested|i'?ll pass|maybe (later|another time)|nah|not today)\b/i,
  hesitate: /^(hmm+|maybe|idk|i don'?t know|not sure|eh+)\b/i,
  buy: /\b(buy|purchase|unlock|i'?d (love|like) to see|want to see|wanna see|do (you|u) (have|sell|got) (a |an |any |some )?([\w'-]+ ){0,3}(vids?|videos?|sets?|pics?|photos?|clips?)|what (do|would) (you|u) recommend|i'?ll take|how do i get|send (me )?(it|that|one)|i want (it|that|one|something))\b/i,
  price: /\b(how much|price|prices|cost|costs|bundles?|discounts?|deals?|promo|code)\b|\$\d/i,
  content: /\b(what (kind of |sort of )?(content|stuff|vids?|videos|sets?|pics)|anything new|what'?s new|whats new|what else|new (vids?|videos|sets?|content)|what do (you|u) (post|offer|have|sell)|what can i (get|buy))\b/i,
  smallq: /\b(what'?s up|whats up|wyd|how are (you|u)|hru|how'?s it going|how was (your|ur) day)\b/i,
  compliment: /\b(so (pretty|cute|beautiful|gorgeous|stunning|talented)|ur (so )?(pretty|cute|gorgeous)|you'?re (so )?(pretty|cute|beautiful|gorgeous|amazing|talented)|love (your|ur) (page|content|vids?|photos?|style)|(your|ur) (last |latest )?(vid|video|set|photos?) (was|were|is) (so )?(good|amazing|great|fire))\b/i,
  reaction: /^(haha+|hehe+|lol+|lmao+|nice+|cool+|ok(ay)?|love (it|that)|omg+|same+|true+|fair|yesss*|yay+|aw+)\b/i,
  thanks: /^(thanks|thank (you|u)|ty|thx|tysm)\b/i,
  greet: /^(hi+|hey+|hello+|yo+|hii+|heyy+|sup|hiya|good (morning|evening|afternoon))\b/i,
};
const EMOJI = /\p{Extended_Pictographic}/u;

export function detectSituation(burstText: string, history: Msg[]): Situation {
  const t = burstText.trim();
  const lastOut = [...history].reverse().find((m) => m.direction === "OUTBOUND");
  const offeredRecently = !!lastOut && /\$\d/.test(lastOut.body);
  if (RX.meet.test(t)) return "meet_request";
  if (RX.ai.test(t)) return "ai_question";
  if (RX.live.test(t)) return "live_question";
  if (RX.bye.test(t) && t.length < 40) return "goodbye";
  if (RX.cantAfford.test(t)) return "cant_afford";
  if (RX.decline.test(t)) return "decline";
  if (offeredRecently && RX.hesitate.test(t)) return "hesitation";
  if (RX.buy.test(t)) return "buying_interest";
  if (RX.price.test(t)) return "price_question";
  if (RX.content.test(t)) return "content_question";
  if (RX.compliment.test(t)) return "compliment";
  const onlyEmoji = t.replace(/[\s\p{Extended_Pictographic}️‍]/gu, "") === "" && EMOJI.test(t);
  if (onlyEmoji || ((RX.reaction.test(t) || RX.thanks.test(t)) && t.length < 25 && !/\?|\b(what|how|why|wyd|up)\b/i.test(t))) return "reaction";
  if (RX.greet.test(t) && t.length < 60) {
    const priorOut = history.some((m) => m.direction === "OUTBOUND");
    return priorOut ? "greeting_return" : "greeting_new";
  }
  if (/\?/.test(t) && /\b(you|u|your|ur)\b/i.test(t)) return "personal_question";
  return "small_talk";
}

export type SubscriberStyle = { avgChars: number; lowercase: boolean; emoji: boolean; text: string; targetMaxChars: number };

/** How the subscriber writes, so the reply can match their energy instead of answering a "hi" with an essay. */
export function subscriberStyle(history: Msg[], replyCap: number): SubscriberStyle {
  const inbound = history.filter((m) => m.direction === "INBOUND").slice(-6).map((m) => m.body.trim()).filter(Boolean);
  if (!inbound.length) return { avgChars: 0, lowercase: false, emoji: false, text: "", targetMaxChars: replyCap };
  const avg = Math.round(inbound.reduce((a, b) => a + b.length, 0) / inbound.length);
  const lettersLower = inbound.filter((m) => /[a-z]/.test(m) && m === m.toLowerCase()).length / inbound.length;
  const emoji = inbound.filter((m) => EMOJI.test(m)).length / inbound.length >= 0.4;
  const lowercase = lettersLower >= 0.6;
  const size = avg < 25 ? "very short" : avg < 70 ? "short" : avg < 160 ? "medium-length" : "long";
  const target = Math.min(replyCap, Math.max(60, Math.round(avg * (avg < 25 ? 3.2 : avg < 70 ? 2 : 1.3))));
  const bits = [`They write ${size} messages (about ${avg} characters)`, lowercase ? "mostly in lowercase" : "", emoji ? "with emoji" : ""].filter(Boolean);
  return { avgChars: avg, lowercase, emoji, text: `${bits.join(", ")}. Match their energy: keep your reply under ~${target} characters.`, targetMaxChars: target };
}

export type OfferMode = "none" | "answer" | "suggest";
export type OfferPolicy = { mode: OfferMode; reason: string; eligibleIds: string[] };

const itemWords = (c: Pick<CatalogFact, "title" | "description">) => new Set(`${c.title} ${c.description}`.toLowerCase().match(/[a-z]{4,}/g) ?? []);
export function mentionsItem(text: string, c: Pick<CatalogFact, "title">) {
  const t = text.toLowerCase();
  const title = c.title.toLowerCase();
  const key = title.split(/\s+/).find((w) => w.length >= 5) ?? title;
  return t.includes(title) || t.includes(key);
}

/**
 * When a paid item may come up. Answering a direct question is always fine; suggesting needs a genuine
 * interest signal; after an offer or a "no" there is a cooling period. Purchased and recently declined
 * items are never pitched.
 */
export function offerPolicy(input: {
  situation: Situation;
  history: Msg[];
  catalog: CatalogFact[];
  declinedTitles: string[];
  doNotContact: boolean;
  suppressed: boolean;
  cooldownHours: number;
  burstText: string;
}): OfferPolicy {
  const declined = new Set(input.declinedTitles.map((t) => t.toLowerCase()));
  const pitchable = input.catalog.filter((c) => !c.alreadyPurchased && !declined.has(c.title.toLowerCase()) && c.priceConfirmed && c.priceCents != null);
  const lastOffer = [...input.history].reverse().find((m) => m.direction === "OUTBOUND" && (input.catalog.some((c) => mentionsItem(m.body, c)) || /\$\d/.test(m.body)));
  const cooling = !!lastOffer && lastOffer.hoursAgo < input.cooldownHours;
  if (input.doNotContact) return { mode: "none", reason: "This subscriber asked not to be contacted about offers.", eligibleIds: [] };
  if (["decline", "hesitation", "cant_afford"].includes(input.situation))
    return { mode: "none", reason: "They just said no, hesitated or mentioned money. Respect it warmly and do not mention any paid item.", eligibleIds: [] };
  if (input.situation === "buying_interest") {
    const words = new Set(input.burstText.toLowerCase().match(/[a-z]{4,}/g) ?? []);
    const ranked = [...pitchable].sort((a, b) => [...itemWords(b)].filter((w) => words.has(w)).length - [...itemWords(a)].filter((w) => words.has(w)).length);
    return ranked.length
      ? { mode: "suggest", reason: "They showed genuine interest. Suggest the ONE item that fits best, with its exact price, in a relaxed way.", eligibleIds: ranked.slice(0, 2).map((c) => c.id) }
      : { mode: "answer", reason: "They're interested, but nothing new is available for them. Say so kindly.", eligibleIds: [] };
  }
  if (input.situation === "content_question" || input.situation === "price_question")
    return { mode: "answer", reason: "They asked directly. Answer accurately with real items and exact prices; no pressure, no follow-up pitch.", eligibleIds: pitchable.map((c) => c.id) };
  if (input.suppressed) return { mode: "none", reason: "They declined recently, so offers are paused for them.", eligibleIds: [] };
  if (cooling) return { mode: "none", reason: `An offer was mentioned ${Math.round(lastOffer!.hoursAgo * 10) / 10}h ago. Just chat; don't bring it up again.`, eligibleIds: [] };
  return { mode: "none", reason: "They're just chatting. Keep the conversation going; don't bring up paid content.", eligibleIds: [] };
}

/** Short per-fan brief (memory) the model reads before replying. */
export function fanBrief(input: { remembered: string[]; purchasedTitles: string[]; declinedTitles: string[]; history: Msg[]; daysSinceLastChat: number | null }) {
  const lines: string[] = [];
  for (const r of input.remembered.slice(-8)) lines.push(`Remember: ${r}`);
  if (input.purchasedTitles.length) lines.push(`Already bought: ${input.purchasedTitles.join(", ")} (never offer these again)`);
  if (input.declinedTitles.length) lines.push(`Recently said no to: ${input.declinedTitles.join(", ")} (don't push)`);
  if (input.daysSinceLastChat != null && input.daysSinceLastChat >= 1) lines.push(`Last chatted ${Math.round(input.daysSinceLastChat)} day(s) ago`);
  const ourMsgs = input.history.filter((m) => m.direction === "OUTBOUND");
  const lastTwoQuestions = ourMsgs.slice(-2).filter((m) => m.body.trim().endsWith("?")).length;
  if (lastTwoQuestions >= 1 && ourMsgs.at(-1)?.body.trim().endsWith("?")) lines.push("Your last message already asked a question. Don't ask another unless they asked you something.");
  return lines;
}

/**
 * Original example moves per situation (neutral voice; the model rewrites them in the creator's style).
 * They teach the *shape* of a good reply: react to what was said, one thought, no interrogation, no essay.
 */
export const PLAYBOOK: Record<Situation, { fan: string; reply: string; why: string }[]> = {
  greeting_new: [
    { fan: "hii", reply: "hiii welcome!! so glad you're here", why: "warm and short; no questionnaire" },
    { fan: "hey just subscribed", reply: "hey you! thank you, that honestly made my day", why: "thank them; leave room for them to talk" },
  ],
  greeting_return: [
    { fan: "hey I'm back", reply: "heyyy welcome back! how did the exam go?", why: "pick up a thread you remember" },
    { fan: "hiii", reply: "hii you, missed chatting with you", why: "familiar, not over the top" },
  ],
  small_talk: [
    { fan: "just got off work", reply: "finally free!! long day?", why: "react first, one light question at most" },
    { fan: "went hiking last weekend", reply: "ooh jealous, the weather was so nice for it", why: "share a reaction; not every reply needs a question" },
    { fan: "watched a horror movie and couldn't sleep", reply: "lmaooo that's the best kind of horror movie tho", why: "match their humour" },
  ],
  personal_question: [
    { fan: "what camera do you use?", reply: "an old 35mm film camera mostly, the grain is everything", why: "answer only from approved facts; if unknown, keep it light without inventing" },
  ],
  compliment: [
    { fan: "ur so pretty", reply: "stoppp you're too sweet", why: "accept it simply; don't stack compliments back" },
    { fan: "your last video was so good", reply: "aw thank you!! that one was so fun to make", why: "gratitude + a tiny detail" },
  ],
  reaction: [
    { fan: "haha nice", reply: "hehe", why: "tiny reaction, or no reply at all if nothing needs saying" },
    { fan: "❤️", reply: "", why: "an emoji after a closing message often needs no reply (WAIT)" },
  ],
  goodbye: [{ fan: "night!", reply: "", why: "they're signing off: WAIT, or at most a two-word goodnight" }],
  content_question: [
    { fan: "anything new this week?", reply: "yes! new ones go up mondays and thursdays, the latest is the skatepark sunset one", why: "answer with real facts and at most one item; no hard sell" },
  ],
  price_question: [
    { fan: "how much is the hike set", reply: "the autumn hike set is $12", why: "exact price from the catalog, nothing invented" },
    { fan: "how much are your videos", reply: "skatepark sunset is $15 and the thrift haul is $10", why: "list a couple of real prices plainly" },
  ],
  buying_interest: [
    { fan: "i'd love to see you skate, do u have a vid?", reply: "omg yes, i have one from the skatepark at golden hour, 8 mins, it's $15. want it?", why: "ONE fitting item, real price, simple yes/no" },
  ],
  hesitation: [{ fan: "hmm maybe", reply: "no pressure at all!", why: "never push after hesitation" }],
  decline: [{ fan: "no thanks, not right now", reply: "totally fine! so how's your week going", why: "accept warmly, change the subject, never re-pitch" }],
  cant_afford: [{ fan: "money is tight this month", reply: "aw don't worry about it at all, I'm just happy you're here", why: "no selling, no guilt" }],
  ai_question: [{ fan: "is this a bot?", reply: "fair question! the team uses AI to help with some replies, and a real person can step in anytime", why: "always honest about AI assistance" }],
  meet_request: [{ fan: "we should meet up, where do you live?", reply: "haha I keep everything on here, but I love chatting with you here", why: "no meetups, calls, location or personal contact" }],
  live_question: [{ fan: "r u online rn?", reply: "I can't really say what I'm up to rn hehe, but I'm glad you messaged", why: "never claim live activity or presence" }],
};

export const SITUATION_HINT: Record<Situation, string> = {
  greeting_new: "A new subscriber is saying hi. Welcome them briefly and warmly.",
  greeting_return: "Someone you've chatted with before is back. Pick up something you remember if it fits.",
  small_talk: "They're just chatting. React to what they actually said. A question is optional, not required.",
  personal_question: "They asked about the creator. Answer only from approved facts; never invent personal details.",
  compliment: "They paid a compliment. Accept it simply and warmly.",
  reaction: "A short reaction. Reply with something tiny, or choose WAIT if nothing needs saying.",
  goodbye: "They're signing off. Usually WAIT; at most a very short goodbye.",
  content_question: "They asked what content there is. Answer from facts and the catalog; mention at most one or two items.",
  price_question: "They asked about price. Give exact catalog prices only.",
  buying_interest: "They're genuinely interested in buying. Suggest one fitting item with its price, low-pressure.",
  hesitation: "They're hesitating about an offer. Take the pressure off; don't repeat the offer.",
  decline: "They said no. Accept it, keep the chat friendly, and don't mention the item again.",
  cant_afford: "They mentioned money is tight. Be kind; no selling at all.",
  ai_question: "They asked if replies are automated. Answer honestly that AI helps with some replies.",
  meet_request: "They want to meet or move off the platform. Decline kindly; no location, calls or contact details.",
  live_question: "They asked what the creator is doing right now. Never claim to be online, nearby or doing something right now.",
};
