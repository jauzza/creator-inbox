import { buildReplyMessages, deriveChat, parseReplyOutput, type ReplyContext, type ReplyOutput } from "./prompt";
import { validateReply, hasBlocking, STYLE_CODES, type Issue } from "./validator";
import { AiError, type AiProvider } from "./types";
import type { AiSettings } from "./config";

export type PipelineResult = {
  output: ReplyOutput | null;
  issues: Issue[];
  rewriteCount: number;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  calls: number;
  model: string;
  error?: { kind: string; message: string };
};

/**
 * One generation, at most one bounded rewrite, then stop. No self-critique loops.
 * Blank/invalid JSON is retried once (DeepSeek documents occasional blank JSON-mode output).
 */
export async function runReplyPipeline(
  provider: AiProvider,
  model: string,
  settings: Pick<AiSettings, "maxOutputTokens" | "temperature" | "topP" | "thinking" | "timeoutMs">,
  ctx0: ReplyContext,
  opts: { maxRewrites: number; recentOutbound: string[] },
): Promise<PipelineResult> {
  const ctx: ReplyContext = { ...ctx0, chat: deriveChat(ctx0) };
  const res: PipelineResult = { output: null, issues: [], rewriteCount: 0, tokensIn: 0, tokensOut: 0, latencyMs: 0, calls: 0, model };
  const latestInbound = [...ctx.messages].reverse().find((m) => m.direction === "INBOUND")?.body ?? "";

  const call = async (c: ReplyContext) => {
    res.calls++;
    const r = await provider.complete({
      messages: buildReplyMessages(c),
      model,
      json: true,
      maxTokens: settings.maxOutputTokens,
      temperature: settings.thinking === "enabled" ? null : settings.temperature,
      topP: settings.topP,
      thinking: settings.thinking,
      timeoutMs: settings.timeoutMs,
    });
    res.tokensIn += r.tokensIn;
    res.tokensOut += r.tokensOut;
    res.latencyMs += r.latencyMs;
    res.model = r.model;
    return parseReplyOutput(r.text);
  };

  try {
    let out = await call(ctx);
    if (!out) out = await call(ctx); // one retry for blank/invalid JSON
    if (!out) {
      res.error = { kind: "bad_output", message: "Model output did not match the reply schema (after one retry)" };
      return res;
    }
    const check = (o: ReplyOutput) => validateReply(o, { style: ctx.style, catalog: ctx.catalog, recentOutbound: opts.recentOutbound, latestInbound, chat: ctx.chat });
    let issues = check(out);
    // One bounded rewrite for safety blocks and for style problems (too long, question streak, generic...).
    if ((hasBlocking(issues) || issues.some((i) => STYLE_CODES.has(i.code))) && opts.maxRewrites > 0) {
      res.rewriteCount = 1;
      const second = await call({ ...ctx, rewriteFeedback: issues.map((i) => `${i.code}: ${i.detail}`) });
      if (second) {
        const secondIssues = check(second);
        const score = (xs: Issue[]) => xs.filter((i) => i.severity === "block").length * 10 + xs.length;
        if (score(secondIssues) <= score(issues)) {
          out = second;
          issues = secondIssues;
        }
      }
    }
    res.output = out;
    res.issues = issues;
    return res;
  } catch (e) {
    const err = e instanceof AiError ? e : new AiError(e instanceof Error ? e.message : String(e), "network");
    res.error = { kind: err.kind, message: err.message };
    return res;
  }
}
