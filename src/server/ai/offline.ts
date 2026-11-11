import type { AiProvider, CompletionRequest, CompletionResult } from "./types";

/**
 * Offline, rule-based stand-in for a language model. Used ONLY when no AI provider is configured
 * (labelled "Simulator AI (offline rules)" everywhere it appears). It consumes the exact prompt the
 * real model would get, so the parse → validate → rewrite → policy pipeline is exercised end to end.
 * It is not a quality benchmark.
 */
export class OfflineRulesProvider implements AiProvider {
  readonly id = "offline";
  readonly label = "Simulator AI (offline rules)";
  readonly isOffline = true;
  /** Failure injection (simulator control): number of upcoming completions that return malformed output. */
  constructor(private consumeFailure: () => Promise<boolean> = async () => false) {}

  async listModels() {
    return ["offline-rules-v1"];
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const started = Date.now();
    const user = req.messages.find((m) => m.role === "user")?.content ?? "";
    const system = req.messages.find((m) => m.role === "system")?.content ?? "";
    if (await this.consumeFailure()) {
      return { text: "Sorry, I can't produce json right now", tokensIn: 0, tokensOut: 0, latencyMs: 1, model: "offline-rules-v1" };
    }
    const out = finish(respond(user), readStyle(system));
    return {
      text: JSON.stringify(out),
      tokensIn: Math.ceil(user.length / 4),
      tokensOut: Math.ceil(JSON.stringify(out).length / 4),
      latencyMs: Date.now() - started,
      model: "offline-rules-v1",
    };
  }
}

function section(src: string, tag: string) {
  const m = src.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m ? m[1].trim() : "";
}

function respond(user: string) {
  const convo = section(user, "conversation").split("\n").filter(Boolean);
  const lastCustomer = [...convo].reverse().find((l) => l.startsWith("[customer"))?.replace(/^\[[^\]]*\]\s*/, "") ?? "";
  const t = lastCustomer.toLowerCase();
  const facts = section(user, "facts").split("\n").filter((l) => /^F\d+:/.test(l));
  const catalog = section(user, "catalog").split("\n").filter((l) => /^C\d+:/.test(l));
  const rewrite = section(user, "rewrite");
  const factFor = (re: RegExp) => facts.find((f) => re.test(f));
  const id = (line: string) => line.split(":")[0];
  const text = (line: string) => line.replace(/^[FC]\d+:\s*/, "");

  if (/\b(are you (a )?(bot|ai|robot|real)|is this (a )?(bot|ai|automated)|chat ?gpt)/.test(t))
    return a("ANSWER", "fair question! the team uses AI assistance to draft some replies, and a person can jump in any time if you'd like.", "Customer asked about automation; answered honestly.");
  if (/\b(bye|good ?night|gn|see (you|ya)|ttyl)\b/.test(t) && t.length < 40) return a("WAIT", "", "Customer is signing off; no reply needed.");
  if (/\b(what (kind|kinds|sort|type|types) of (content|stuff|things|posts|photos)|what do you (post|offer|share|make|do here)|i'?m new here|just (joined|subscribed))\b/.test(t) && !/\b(price|how much|cost)\b/.test(t)) {
    const likes = factFor(/enjoys|loves|into /i);
    const sched = factFor(/post|tuesday|friday/i);
    const topics = likes ? text(likes).replace(/^(Enjoys|Loves|Into)\s+/i, "").replace(/\.$/, "") : "";
    const body = [topics ? `you'll find photo sets here, mostly about ${topics}.` : "you'll find photo sets and updates here."];
    if (sched) body.push(`${text(sched).replace(/^Posts new (photo )?sets/, "new sets go up").replace(/^Posts/, "new sets go up").replace(/\.$/, "")}.`);
    const titles = catalog.filter((c) => !c.includes("already_purchased")).slice(0, 2).map((c) => text(c).split(/:\s/)[0]);
    const used = [likes, sched].filter((x): x is string => !!x).map(id);
    return a("ANSWER", body.join(" "), `New customer asked what the page offers; answered from approved facts ${used.join(", ") || "(none)"}.`, null, used, {
      greet: "welcome",
      extra: titles.length ? `a couple of favourites right now are ${titles.join(" and ")}.` : undefined,
      question: "anything in particular you're into?",
    });
  }
  if (/\b(no thanks|no thank you|not interested|i'?ll pass|maybe (later|another time)|can'?t afford|too expensive)\b/.test(t))
    return a("ACKNOWLEDGE", "no worries at all!", "Customer declined; acknowledge without pushing.");
  if (/^(thanks|thank you|thank u|thx|ty)\b/.test(t.trim())) return a("ACKNOWLEDGE", "anytime 😊", "Short thanks; brief acknowledgement.");
  if (t.trim().length <= 14 && /^(ok|okay|cool|nice|haha|lol|love it|great|👍|❤️|ok cool|haha nice)/u.test(t.trim()))
    return a("ACKNOWLEDGE", "😊", "Short reaction; brief acknowledgement.");
  if (/\b(price|how much|cost|catalog|set|bundle|buy|unlock|what('?s| is) new)\b/.test(t)) {
    const words = new Set(t.match(/[a-z]{4,}/g) ?? []);
    const available = catalog.filter((c) => !c.includes("already_purchased"));
    const generic = new Set(["price", "much", "cost", "catalog", "sets", "bundle", "what", "photos", "with", "from"]);
    const best = available.find((c) => (c.toLowerCase().match(/[a-z]{4,}/g) ?? []).some((w) => !generic.has(w) && words.has(w)));
    // Never answer about a different item than the one asked about.
    if (!best && /\b(price|how much|cost)\b/.test(t) && available.length && !/\b(set|bundle)\b/.test(t)) {
      return a("CLARIFY", "happy to help! which set are you asking about?", "Price question without a specific item.");
    }
    if (!best) return a("HANDOFF", "", "Asked about an item that is not in the approved catalog; needs a person.", "No matching approved catalog item");
    const [title, rest] = text(best).split(/:\s(.+)/);
    const priceMatch = best.match(/price: (\$\d+(?:\.\d{2})?)/);
    const priceTxt = priceMatch && !rewrite.includes("unsupported_price") ? ` it's ${priceMatch[1].replace(/\.00$/, "")}.` : " I'll check the price for you.";
    return a("ANSWER", `the ${title} set is ${(rest ?? "").split(" | ")[0].replace(/\.$/, "")}.${priceTxt}`, `Answered with approved catalog item ${id(best)}.`, null, [id(best)], { question: "want to know anything else about it?" });
  }
  if (/\b(cancel|renew|subscription|sub\b|billing date)/.test(t)) {
    const f = factFor(/subscription|renew/i);
    if (f) return a("ANSWER", text(f).replace(/^Subscription renews monthly; c/, "it renews monthly, and c"), `Answered from approved fact ${id(f)}.`, null, [id(f)]);
  }
  if (/\b(when|post|new stuff|schedule|upload)\b/.test(t)) {
    const f = factFor(/post|tuesday|friday/i);
    if (f) return a("ANSWER", `${text(f).replace(/^Posts new (photo )?sets/, "new sets go up").replace(/^Posts/, "new sets go up").replace(/\.$/, "")} 📷`, `Answered from approved fact ${id(f)}.`, null, [id(f)], { greet: "hey" });
  }
  if (/\b(hi|hey|hello|hiya)\b/.test(t) && t.length < 30) return a("ANSWER", "thanks for the message 😊", "Greeting.", null, [], { greet: "hey", question: "anything I can help with?", alwaysAsk: true });
  if (/\b(hik|cook|film|camera|photograph)/.test(t)) {
    const f = factFor(/hiking|cooking|photography/i);
    if (f) return a("ANSWER", "film photography and hiking are big favourites here too.", `Light conversation grounded in ${id(f)}.`, null, [id(f)], { greet: "react" });
  }
  return a("CLARIFY", "happy to help, could you tell me a bit more about what you're looking for?", "Request unclear; asked one clarifying question.");
}

type Extras = { greet?: "hey" | "welcome" | "react"; question?: string; extra?: string; alwaysAsk?: boolean };
type Draft = { action: string; reply: string; explanation: string; used_facts: string[]; handoff_reason: string | null; x: Extras };

function a(action: string, reply: string, explanation: string, handoff_reason: string | null = null, used_facts: string[] = [], x: Extras = {}): Draft {
  return { action, reply, explanation, used_facts, handoff_reason, x };
}

// ---------------------------------------------------------------------------------------------
// Style application. The offline rules read the same "Style:" lines the real model gets and apply
// them with plain text rules, so changing tone/length/emoji visibly changes the sample reply.
// This is a deterministic approximation for the demo, not a writing-quality benchmark.
// ---------------------------------------------------------------------------------------------
type StyleHints = { tone: string; formality: number; expressiveness: number; length: string; emoji: string; lowercase: boolean; contractions: boolean; likes: string[]; avoid: string[] };

export function readStyle(system: string): StyleHints {
  const num = (re: RegExp, d: number) => Number(system.match(re)?.[1] ?? d);
  const list = (re: RegExp) => (system.match(re)?.[1] ?? "").split(" | ").map((x) => x.trim()).filter(Boolean);
  const emoji = /Emoji: do not use emoji/.test(system) ? "none" : (system.match(/Emoji: (rare|some|often)/)?.[1] ?? "rare");
  return {
    tone: system.match(/Tone: (\w+)\./)?.[1] ?? "warm",
    formality: num(/Formality (\d+)\/100/, 30),
    expressiveness: num(/Expressiveness (\d+)\/100/, 50),
    length: system.match(/Length: (short|medium|long)/)?.[1] ?? "short",
    emoji,
    lowercase: /Mostly lowercase is fine\./.test(system),
    contractions: !/Avoid contractions\./.test(system),
    likes: list(/Expressions the creator likes[^:]*: (.+)/),
    avoid: list(/Never use: (.+)/),
  };
}

const GREETINGS: Record<string, Record<string, string>> = {
  hey: { warm: "hey!", playful: "heyy!", confident: "hi.", concise: "", professional: "Hello." },
  welcome: { warm: "welcome!", playful: "welcome aboard!", confident: "welcome.", concise: "", professional: "Welcome, and thank you for your message." },
  react: { warm: "oh nice, love that!", playful: "ooh, love that!", confident: "nice.", concise: "", professional: "That sounds lovely." },
};
const EMOJI_FOR: Record<string, string[]> = { warm: ["😊", "📷"], playful: ["✨", "😄"], confident: ["📷", "👌"], concise: ["🙂", "📷"], professional: ["🙂", "📷"] };
const CONTRACTIONS: [RegExp, string][] = [
  [/\byou'll\b/gi, "you will"], [/\bit's\b/gi, "it is"], [/\bI'll\b/g, "I will"], [/\bi'll\b/g, "i will"], [/\bdon't\b/gi, "do not"],
  [/\byou're\b/gi, "you are"], [/\bI'm\b/g, "I am"], [/\bwhat's\b/gi, "what is"], [/\bcan't\b/gi, "cannot"], [/\bthat's\b/gi, "that is"],
];
const EMOJI_RE = /\s*\p{Extended_Pictographic}\uFE0F?/gu;

function finish(d: Draft, h: StyleHints) {
  const { x, ...out } = d;
  if (!out.reply) return out;
  out.reply = stylize(out.reply, out.action, x, h);
  return out;
}

export function stylize(reply: string, action: string, x: Extras, h: StyleHints): string {
  const hadEmoji = EMOJI_RE.test(reply);
  EMOJI_RE.lastIndex = 0;
  let body = reply.replace(EMOJI_RE, "").trim();
  const tone = GREETINGS.hey[h.tone] !== undefined ? h.tone : "warm";
  const parts: string[] = [];

  // Opening: tone decides the greeting; a liked expression can replace a casual "hey".
  let greet = x.greet ? GREETINGS[x.greet][tone] : "";
  const liked = h.likes.find((l) => l.length <= 20 && /[!.]$/.test(l));
  if (greet && x.greet === "hey" && liked && (tone === "warm" || tone === "playful") && h.expressiveness >= 40) greet = liked;
  if (greet && h.expressiveness <= 25) greet = greet.replace(/!+$/, ".").replace(/^(ooh|oh), /i, "");
  if (greet) parts.push(greet);
  if (body && !/[.!?]$/.test(body)) body += ".";
  parts.push(body);

  // Expressiveness: expressive welcomes gain a line of warmth; calm replies lose exclamation marks (below).
  const expressive = h.expressiveness >= 75 && action === "ANSWER";
  if (expressive && x.greet === "welcome" && (tone === "warm" || tone === "playful")) parts.push(tone === "playful" ? "so happy you're here!" : "really glad you found the page!");

  // Length: short = core answer only; medium adds the follow-up question; long adds detail too.
  const ask = x.question && (x.alwaysAsk || h.length !== "short") && action === "ANSWER";
  if (h.length === "long" && x.extra) parts.push(x.extra);
  if (ask) parts.push(x.question!);
  let text = parts.filter(Boolean).join(" ");

  if (h.expressiveness <= 25) text = text.replace(/!+/g, ".");
  if (expressive) text = text.replace(/\.(\s|$)/, "!$1");

  if (!h.contractions) for (const [re, rep] of CONTRACTIONS) text = text.replace(re, rep);

  // Formality: polished writing gets standard capitalisation and no slang.
  if (h.formality >= 65 || tone === "professional") {
    text = text.replace(/\bstuff\b/gi, "content").replace(/\bheyy?!/gi, "Hello!").replace(/\bsets\b/g, "photo sets").replace(/photo photo sets/g, "photo sets");
  }
  const lower = h.lowercase && h.formality < 60 && tone !== "professional";
  text = text.replace(/(^|[.!?]\s+)([a-zA-Z])/g, (_m, pre, ch) => pre + (lower ? ch.toLowerCase() : ch.toUpperCase()));

  for (const p of h.avoid) if (p) text = text.replace(new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "").replace(/\s{2,}/g, " ").trim();

  // Emoji: none / rarely (keep one only if the rule had one) / sometimes (one) / often (two).
  const pool = EMOJI_FOR[tone];
  if (h.emoji === "some" || (h.emoji === "rare" && hadEmoji)) text += ` ${pool[0]}`;
  if (h.emoji === "often") text = text.replace(/([.!?])(\s)/, `$1 ${pool[1]}$2`) + ` ${pool[0]}`;
  return text.replace(/\s+([,.!?])/g, "$1").trim();
}
