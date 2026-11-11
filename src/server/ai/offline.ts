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
    if (await this.consumeFailure()) {
      return { text: "Sorry, I can't produce json right now", tokensIn: 0, tokensOut: 0, latencyMs: 1, model: "offline-rules-v1" };
    }
    const out = respond(user);
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
    return a("ANSWER", `the ${title} set is ${(rest ?? "").split(" | ")[0].replace(/\.$/, "")}.${priceTxt}`, `Answered with approved catalog item ${id(best)}.`, null, [id(best)]);
  }
  if (/\b(cancel|renew|subscription|sub\b|billing date)/.test(t)) {
    const f = factFor(/subscription|renew/i);
    if (f) return a("ANSWER", text(f).replace(/^Subscription renews monthly; c/, "it renews monthly, and c"), `Answered from approved fact ${id(f)}.`, null, [id(f)]);
  }
  if (/\b(when|post|new stuff|schedule|upload)\b/.test(t)) {
    const f = factFor(/post|tuesday|friday/i);
    if (f) return a("ANSWER", `hey! ${text(f).replace(/^Posts/, "new sets go up").replace(/\.$/, "")} 📷`, `Answered from approved fact ${id(f)}.`, null, [id(f)]);
  }
  if (/\b(hi|hey|hello|hiya)\b/.test(t) && t.length < 30) return a("ANSWER", "hey! thanks for the message 😊 anything I can help with?", "Greeting.");
  if (/\b(hik|cook|film|camera|photograph)/.test(t)) {
    const f = factFor(/hiking|cooking|photography/i);
    if (f) return a("ANSWER", "oh nice, love that! film photography and hiking are big favourites here too.", `Light conversation grounded in ${id(f)}.`, null, [id(f)]);
  }
  return a("CLARIFY", "happy to help, could you tell me a bit more about what you're looking for?", "Request unclear; asked one clarifying question.");
}

function a(action: string, reply: string, explanation: string, handoff_reason: string | null = null, used_facts: string[] = []) {
  return { action, reply, explanation, used_facts, handoff_reason };
}
