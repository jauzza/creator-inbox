import type { AiProvider, CompletionRequest, CompletionResult } from "./types";

/**
 * Offline, rule-based stand-in for a language model ("Sample replies"). Used ONLY when no AI provider is
 * configured, and labelled as a sample everywhere it appears. It reads the exact prompt a real model gets
 * (situation, offer policy, subscriber style, remembered facts, catalog, creator style) and writes a short
 * reply with simple rules, so the whole pipeline and the demo behave realistically without a key.
 * It is not a writing-quality benchmark: connect a real model for natural replies.
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
    const out = finish(respond(user), readStyle(system), user);
    return {
      text: JSON.stringify(out),
      tokensIn: Math.ceil((user.length + system.length) / 4),
      tokensOut: Math.ceil(JSON.stringify(out).length / 4),
      latencyMs: Date.now() - started,
      model: "offline-rules-v1",
    };
  }
}

function section(src: string, tag: string) {
  const m = src.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return m ? m[1].trim() : "";
}
const lines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);
const body = (l: string) => l.replace(/^\[[^\]]*\]\s*/, "");
function hash(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

type Item = { id: string; title: string; desc: string; price: string | null; purchased: boolean; mayOffer: boolean; raw: string };

function respond(user: string): Draft {
  const situation = (section(user, "situation").match(/^(\w+)/)?.[1] ?? "small_talk") as string;
  const mode = user.match(/<offer_policy mode="(\w+)"/)?.[1] ?? "none";
  const latest = lines(section(user, "latest_messages")).map(body);
  const latestText = latest.join(" ");
  const t = latestText.toLowerCase();
  const history = lines(section(user, "conversation"));
  const ourRecent = history.filter((l) => l.startsWith("[creator")).map(body).slice(-4);
  const lastOurs = ourRecent.at(-1) ?? "";
  const facts = lines(section(user, "facts")).filter((l) => /^F\d+:/.test(l)).map((l) => l.replace(/^F\d+:\s*/, ""));
  const remembered = lines(section(user, "remembered")).filter((l) => l.startsWith("Remember:")).map((l) => l.replace(/^Remember:\s*/, ""));
  const subStyle = section(user, "subscriber_style");
  const tiny = /very short/.test(subStyle);
  const items: Item[] = lines(section(user, "catalog"))
    .filter((l) => /^C\d+:/.test(l))
    .map((l) => {
      const [, id, title, rest] = l.match(/^(C\d+):\s*([^:]+):\s*(.*)$/) ?? [];
      const price = rest?.match(/price: \$(\d+(?:\.\d{2})?)/)?.[1]?.replace(/\.00$/, "") ?? null;
      return { id, title: title?.trim(), desc: (rest ?? "").split(" | ")[0].replace(/\.$/, ""), price, purchased: /already_purchased/.test(l), mayOffer: /may_offer/.test(l), raw: l };
    });
  const rewrite = section(user, "rewrite");
  const pick = <T,>(variants: T[]) => {
    const fresh = variants.filter((v) => !ourRecent.some((o) => o.toLowerCase().startsWith(String(v).toLowerCase().slice(0, 12))));
    const pool = fresh.length ? fresh : variants;
    return pool[hash(latestText + ourRecent.length) % pool.length];
  };
  const schedule = facts.find((f) => /\b(posts?|new (sets|videos))\b/i.test(f) && /day/i.test(f));
  const scheduleTxt = schedule ? schedule.replace(/^Posts new (photo )?(sets|videos)/i, "new $2 go up").replace(/^Posts/i, "new ones go up").replace(/\.$/, "") : "";
  const interests = facts.find((f) => /^(enjoys|loves|into)\b/i.test(f))?.replace(/^(Enjoys|Loves|Into)\s+/i, "").replace(/\.$/, "") ?? "";
  const remember = extractMemories(latestText);
  const price = (i: Item) => (i.price ? ` it's $${i.price}` : "");
  const offerable = items.filter((i) => i.mayOffer).sort((x, y) => Number(/best fit/.test(y.raw)) - Number(/best fit/.test(x.raw)));
  const named = items.find((i) => t.includes(i.title.toLowerCase()) || t.includes(i.title.toLowerCase().split(/\s+/).find((w) => w.length >= 5) ?? "\u0000"));
  const words = new Set(t.match(/[a-z]{4,}/g) ?? []);
  const sharedInterest = interests.split(/,\s*|\s+and\s+/).find((x) => x.split(/\s+/).some((w) => w.length >= 4 && [...words].some((v) => v.startsWith(w.slice(0, 5)))));

  switch (situation) {
    case "goodbye":
      return a("WAIT", "", "They're signing off; no reply needed.", null, [], {}, remember);
    case "reaction": {
      if (!/[a-z]/i.test(latestText) || !lastOurs || !/\?$/.test(lastOurs)) {
        if (!/[a-z]/i.test(latestText)) return a("WAIT", "", "A lone emoji after our message; nothing needs saying.");
      }
      return a("ACKNOWLEDGE", pick(["hehe", "haha right", "ikr"]), "Short reaction; tiny reply.");
    }
    case "ai_question":
      return a("ANSWER", "fair question! the team uses AI to help with some replies, and a real person can step in anytime", "Asked about automation; answered honestly.");
    case "meet_request":
      return a("ANSWER", "haha I keep everything on here, but I love chatting with you here", "Declined meeting or contact off-platform.");
    case "live_question":
      return a("ANSWER", "I can't really say what I'm up to rn, but I'm glad you messaged", "Asked about right now; no live-activity claims.");
    case "decline":
      return a("ACKNOWLEDGE", pick(["totally fine! hope your day's going good", "no worries at all!", "all good, no pressure ever"]), "They said no; accepted without pitching.", null, [], {}, remember);
    case "hesitation":
      return a("ACKNOWLEDGE", pick(["no pressure at all!", "totally up to you, no rush"]), "Hesitation after an offer; took the pressure off.");
    case "cant_afford":
      return a("ACKNOWLEDGE", "aw don't worry about it at all, I'm just glad you're here", "Money is tight; no selling.", null, [], {}, remember);
    case "compliment":
      return a("ANSWER", pick(["stoppp you're too sweet", "aw thank you, that honestly made me smile", "you're so sweet, thank you"]), "Compliment; accepted simply.");
    case "price_question": {
      if (named && named.price) return a("ANSWER", `the ${named.title} one is $${named.price}`, `Exact price from catalog ${named.id}.`, null, [named.id], {}, remember, named.id);
      if (/bundle|discount|code|deal/.test(t)) {
        const i = offerable[0];
        return a("ANSWER", `nothing like that at the moment${i ? `, but ${i.title} is $${i.price}` : ""}`, "No bundles in the catalog; answered honestly.", null, i ? [i.id] : [], {}, remember, i?.id ?? null);
      }
      const two = offerable.slice(0, 2);
      if (!two.length) return a("CLARIFY", "which one are you asking about?", "Price question without a matching item.");
      return a("ANSWER", two.map((i) => `${i.title} is $${i.price}`).join(" and "), "Listed real catalog prices.", null, two.map((i) => i.id), {}, remember, two[0].id);
    }
    case "content_question": {
      const i = offerable.find((x) => !x.purchased) ?? null;
      const isNew = /\bnew here\b|\bjust (joined|subscribed)\b/.test(t);
      const kind = /video/i.test(scheduleTxt) ? "videos" : "photo sets";
      const parts = isNew
        ? ["welcome!!", interests ? `you'll find ${kind} about ${interests}.` : "", scheduleTxt ? `${scheduleTxt}.` : ""]
        : [/what else|else/.test(t) ? "" : scheduleTxt ? `yes! ${scheduleTxt}.` : ""];
      const lead = parts.filter(Boolean).join(" ");
      const extra = i && (!isNew || !interests) ? `${lead ? " " : ""}${/what else|else/.test(t) ? "there's" : "the latest is"} ${i.title}, ${i.desc.charAt(0).toLowerCase() + i.desc.slice(1)},${price(i)}` : "";
      return a("ANSWER", `${lead}${extra}`.trim(), "Answered from approved facts and the catalog.", null, i && extra ? [i.id] : [], {}, remember, i && extra ? i.id : null);
    }
    case "buying_interest": {
      const i = mode === "suggest" ? offerable[0] : null;
      if (!i) return a("ANSWER", scheduleTxt ? `you've got my newest one already! ${scheduleTxt}` : "you've got my newest one already!", "Interest, but nothing new to offer.", null, [], {}, remember);
      return a("ANSWER", `${pick(["yes!", "omg yes,", "ooh yes,"])} I have ${i.title}, ${i.desc.charAt(0).toLowerCase() + i.desc.slice(1)},${price(i)}. want it?`, `Genuine interest; suggested one fitting item (${i.id}).`, null, [i.id], {}, remember, i.id);
    }
    case "greeting_new":
      return a("ANSWER", pick(["welcome!! so glad you found my page", "hiii, thank you for subscribing, that made my day", "hey you! welcome in"]), "New subscriber greeting; short and warm.", null, [], {}, remember);
    case "greeting_return": {
      const name = remembered.find((r) => /^Goes by /i.test(r))?.replace(/^Goes by /i, "");
      const thread = remembered.find((r) => /\b(exam|interview|trip|job|move|surgery|game|match|concert)\b/i.test(r));
      const noun = thread?.match(/\b(exam|interview|trip|job|move|surgery|game|match|concert)\b/i)?.[1];
      if (noun) return a("ANSWER", `${name ? `hey ${name}, ` : ""}welcome back! how did the ${noun.toLowerCase()} go?`, "Returning subscriber; picked up a remembered thread.", null, [], {}, remember);
      return a("ANSWER", `${name ? `hey ${name}! ` : ""}${pick(["welcome back!", "good to see you back!", "heyy, you're back!"])}`, "Returning subscriber.", null, [], {}, remember);
    }
    case "personal_question": {
      const f = facts.find((x) => [...words].some((w) => x.toLowerCase().includes(w.slice(0, 5))));
      if (/\b(tips?|advice|beginner)\b/.test(t)) return a("ANSWER", "aw that honestly makes me so happy! just shoot a lot and don't overthink it, the happy accidents are the best part", "Asked for advice; encouraged without inventing facts.", null, [], {}, remember);
      if (/camera|film|photo/.test(t) && /film photograph/i.test(facts.join(" "))) return a("ANSWER", "mostly an old film camera, film photography is a big favourite", "Answered from approved facts.", null, ["F"], {}, remember);
      if (f) return a("ANSWER", `${f.replace(/\.$/, "").replace(/^(Enjoys|Loves)/i, "I love").replace(/^Posts/i, "I post")}`, "Answered from an approved fact.", null, [], {}, remember);
      return a("ANSWER", "ha good question, I keep a few things private but I love that you asked", "No approved fact; didn't invent one.");
    }
    default: {
      // small talk: react to what they said, sometimes ask one light question.
      let reply: string;
      if (/\b(what did (you|u) do|how was (your|ur) day|what have (you|u) been up to)\b/.test(t)) reply = pick(["not much to report hehe, how was yours?", "honestly a pretty quiet one, how about you?"]);
      else if (/\b(what'?s up|whats up|wyd|how are (you|u)|hru|how'?s it going)\b/.test(t)) reply = pick(["not much! all good over here", "all good over here hehe"]);
      else if (/\b(work|shift|job|office)\b/.test(t)) reply = pick(["finally free! hope it wasn't too long", "ugh work, glad you're done for the day"]);
      else if (/\b(horror|scary|movie)\b/.test(t)) reply = pick(["haha the best ones are the ones that keep you up", "lmao that's the sign of a good horror movie tbh"]);
      else if (sharedInterest) reply = pick([`no way, ${sharedInterest.trim()} is one of my favourite things too`, `love that! ${sharedInterest.trim()} is so my thing`]);
      else if (/\b(tips?|advice|beginner|how do i)\b/.test(t)) reply = "honestly just shoot a lot and don't overthink it, the happy accidents are the best part";
      else reply = pick(["ha I love that", "that's so fair honestly", "omg same"]);
      const canAsk = !/\?$/.test(lastOurs) && !tiny;
      return a("ANSWER", reply, "Small talk; reacted to what they said.", null, [], canAsk ? { question: pick(["what are you up to later?", "how's your week been?"]) } : {}, remember);
    }
  }
}

function extractMemories(text: string) {
  const out: string[] = [];
  const name = text.match(/\b(?:my name is|call me|i'?m called)\s+([A-Z][a-z]{1,14})\b/);
  if (name) out.push(`Goes by ${name[1]}`);
  const into = text.match(/\bi (?:love|really like|do a lot of|am into|'?m into)\s+([a-z ]{3,30}?)(?:[.!,]|$| too| actually)/i);
  if (into) out.push(`Into ${into[1].trim()}`);
  const plan = text.match(/\b(?:i have|i've got|got) (?:a |an |my )?(big )?(exam|interview|trip|game|concert)[^.!?]{0,30}/i);
  if (plan) out.push(plan[0].replace(/^i have |^i've got |^got /i, "Has ").slice(0, 80));
  return out.slice(0, 3);
}

type Extras = { greet?: "hey" | "welcome" | "react"; question?: string; extra?: string; alwaysAsk?: boolean };
type Draft = { action: string; reply: string; explanation: string; used_facts: string[]; handoff_reason: string | null; x: Extras; remember: string[]; offer_item: string | null };

function a(action: string, reply: string, explanation: string, handoff_reason: string | null = null, used_facts: string[] = [], x: Extras = {}, remember: string[] = [], offer_item: string | null = null): Draft {
  return { action, reply, explanation, used_facts, handoff_reason, x, remember, offer_item };
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
  const tones: [RegExp, string][] = [[/Personality: friendly/, "warm"], [/Personality: playful/, "playful"], [/Personality: confident/, "confident"], [/Personality: short/, "concise"], [/Personality: polished/, "professional"]];
  const emojiLine = system.match(/Emoji: (\w+)/)?.[1] ?? "occasionally";
  const lengthLine = system.match(/Length: ([^\n]+)/)?.[1] ?? "";
  return {
    tone: tones.find(([re]) => re.test(system))?.[1] ?? system.match(/Tone: (\w+)\./)?.[1] ?? "warm",
    formality: num(/Formality (\d+)\/100/, 30),
    expressiveness: num(/Expressiveness (\d+)\/100/, 50),
    length: /one short sentence/.test(lengthLine) ? "short" : /one or two/.test(lengthLine) ? "medium" : /four/.test(lengthLine) ? "long" : (lengthLine.match(/^(short|medium|long)/)?.[1] ?? "short"),
    emoji: { never: "none", occasionally: "rare", often: "some", freely: "often" }[emojiLine] ?? "rare",
    lowercase: /mostly in lowercase|Mostly lowercase is fine/.test(system),
    contractions: !/Avoid contractions\./.test(system),
    likes: list(/Phrases the creator likes[^:]*: (.+)/),
    avoid: list(/Never use: (.+)/),
  };
}

const GREETINGS: Record<string, Record<string, string>> = {
  hey: { warm: "hey!", playful: "heyy!", confident: "hi.", concise: "", professional: "Hello." },
  welcome: { warm: "welcome!", playful: "welcome aboard!", confident: "welcome.", concise: "", professional: "Welcome, and thank you for your message." },
  react: { warm: "oh nice, love that!", playful: "ooh, love that!", confident: "nice.", concise: "", professional: "That sounds lovely." },
};
const EMOJI_FOR: Record<string, string[]> = {
  warm: ["😊", "🤍", "☺️", "🥰"],
  playful: ["✨", "🙈", "🫶", "💕", "🥹"],
  confident: ["😌", "👌", "😏", "🔥"],
  concise: ["🙂", "👍"],
  professional: ["🙂"],
};
const pickFrom = (pool: string[], seed: string, k = 0) => {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return pool[(h + k) % pool.length];
};
const CONTRACTIONS: [RegExp, string][] = [
  [/\byou'll\b/gi, "you will"], [/\bit's\b/gi, "it is"], [/\bI'll\b/g, "I will"], [/\bi'll\b/g, "i will"], [/\bdon't\b/gi, "do not"],
  [/\byou're\b/gi, "you are"], [/\bI'm\b/g, "I am"], [/\bwhat's\b/gi, "what is"], [/\bcan't\b/gi, "cannot"], [/\bthat's\b/gi, "that is"],
];
const EMOJI_RE = /\s*\p{Extended_Pictographic}\uFE0F?/gu;

function finish(d: Draft, h: StyleHints, user: string) {
  const { x, ...out } = d;
  if (!out.reply) return out;
  const tiny = /very short/.test(section(user, "subscriber_style"));
  const rewrite = section(user, "rewrite");
  const hh = tiny ? { ...h, length: "short" } : h;
  let text = stylize(out.reply, out.action, x, hh);
  if (/question_streak/.test(rewrite)) text = text.replace(/\s*[^.!?]*\?(\s*\p{Extended_Pictographic}\uFE0F?)*\s*$/u, "").trim() || text;
  if (/much_longer|too_long/.test(rewrite)) text = text.split(/(?<=[.!?])\s+/)[0];
  out.reply = text;
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
  if (body && !/[.!?]$/.test(body) && (body.length > 18 || parts.length)) body += ".";
  parts.push(body);

  // Expressiveness: expressive welcomes gain a line of warmth; calm replies lose exclamation marks (below).
  const expressive = h.expressiveness >= 75 && action === "ANSWER";
  if (expressive && x.greet === "welcome" && (tone === "warm" || tone === "playful")) parts.push(tone === "playful" ? "so happy you're here!" : "really glad you found the page!");

  // Length: short = core answer only; medium adds the follow-up question; long adds detail too.
  const ask = x.question && (x.alwaysAsk || h.length !== "short") && action === "ANSWER";
  if (h.length === "long" && x.extra) parts.push(x.extra);
  if (ask) parts.push(x.question!);
  let text = parts.filter(Boolean).join(" ");

  // Tone shapes the wording, not just the punctuation (sample rules; a real model does this far better).
  const OPENERS: Record<string, Record<string, string>> = {
    "welcome!!": { playful: "welcome aboard!!", confident: "welcome in.", concise: "welcome!", professional: "Welcome, and thank you for joining." },
    "yes!": { playful: "ooh yes!", confident: "I do.", concise: "yes:", professional: "Certainly." },
    "omg yes,": { playful: "omg yesss,", confident: "I do,", concise: "yes,", professional: "Certainly," },
    "ooh yes,": { playful: "ooh yesss,", confident: "I do,", concise: "yes,", professional: "Certainly," },
    "hey you!": { playful: "heyyy you!", confident: "hey.", concise: "hey!", professional: "Hello, and welcome." },
    "stoppp you're too sweet": { confident: "I know, but thank you", concise: "thank you!", professional: "Thank you, that's very kind." },
  };
  for (const [from, map] of Object.entries(OPENERS)) {
    if (map[tone] && text.toLowerCase().startsWith(from)) text = map[tone] + text.slice(from.length);
  }
  if (tone === "confident") text = text.replace(/!+/g, ".").replace(/\b(honestly|so|totally) /gi, "");
  if (tone === "concise") text = text.split(/(?<=[.!?])\s+/).slice(0, 1).join(" ");
  if (h.expressiveness < 45) text = text.replace(/!{2,}/g, "!");
  if (h.expressiveness <= 25) text = text.replace(/!+/g, ".");
  if (expressive) text = text.replace(/\.(\s|$)/, "!$1");

  if (!h.contractions) for (const [re, rep] of CONTRACTIONS) text = text.replace(re, rep);

  // Formality: polished writing gets standard capitalisation and no slang.
  if (h.formality >= 65 || tone === "professional") {
    text = text.replace(/\bstuff\b/gi, "content").replace(/\bheyy?!/gi, "Hello!").replace(/\bsets\b/g, "photo sets").replace(/photo photo sets/g, "photo sets");
  }
  const lower = h.lowercase && h.formality < 60 && tone !== "professional";
  text = lower ? text.toLowerCase().replace(/\bi\b/g, "i") : text.replace(/(^|[.!?]\s+)([a-z])/g, (_m, pre, ch) => pre + ch.toUpperCase()).replace(/\bi\b/g, "I");

  for (const p of h.avoid) if (p) text = text.replace(new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "").replace(/\s{2,}/g, " ").trim();

  // Emoji: none / rarely (keep one only if the rule had one) / sometimes (one) / often (two).
  const pool = EMOJI_FOR[tone];
  const e1 = pickFrom(pool, text), e2 = pickFrom(pool, text, 1);
  if (h.emoji === "some" || (h.emoji === "rare" && hadEmoji)) text += ` ${e1}`;
  if (h.emoji === "often") text = text.length > 60 ? text.replace(/([.!?])(\s)/, `$1 ${e2}$2`) + ` ${e1}` : `${text} ${e1}`;
  // Texting style drops the final full stop ("omg same" rather than "omg same.").
  if (lower) text = text.replace(/\.(\s*(\p{Extended_Pictographic}\uFE0F?\s*)*)$/u, "$1");
  return text.replace(/\s+([,.!?])/g, "$1").trim();
}
