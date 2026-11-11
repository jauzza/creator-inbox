import { safeFetch, SafeFetchError } from "../net/safeFetch";
import { AiError, type AiProvider, type CompletionRequest, type CompletionResult } from "./types";

/** OpenAI-compatible chat completions adapter (DeepSeek, or any compatible endpoint). */
export class OpenAiCompatibleProvider implements AiProvider {
  readonly isOffline = false;
  constructor(
    readonly id: string,
    readonly label: string,
    private baseUrl: string,
    private apiKey: string,
  ) {}

  private url(path: string) {
    return this.baseUrl.replace(/\/+$/, "") + path;
  }

  async listModels(): Promise<string[] | null> {
    try {
      const res = await safeFetch({ url: this.url("/models"), headers: { authorization: `Bearer ${this.apiKey}` }, timeoutMs: 15000 });
      if (res.status === 401 || res.status === 403) throw new AiError("The AI provider rejected the API key", "auth");
      if (res.status === 404) return null;
      if (res.status >= 300) throw new AiError(`Listing models failed (HTTP ${res.status})`, "bad_response");
      const data = JSON.parse(res.text);
      return Array.isArray(data?.data) ? data.data.map((m: { id: string }) => String(m.id)) : null;
    } catch (e) {
      throw wrap(e);
    }
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const body: Record<string, unknown> = {
      model: req.model,
      messages: req.messages,
      max_tokens: req.maxTokens,
      stream: false,
    };
    if (req.json) body.response_format = { type: "json_object" };
    if (req.temperature != null) body.temperature = req.temperature;
    if (req.topP != null) body.top_p = req.topP;
    if (req.thinking && this.id === "deepseek") body.thinking = { type: req.thinking };
    const started = Date.now();
    try {
      const res = await safeFetch({
        url: this.url("/chat/completions"),
        method: "POST",
        headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify(body),
        timeoutMs: req.timeoutMs,
      });
      if (res.status === 401 || res.status === 403) throw new AiError("The AI provider rejected the API key", "auth");
      if (res.status === 429) throw new AiError("The AI provider is rate limiting requests", "rate_limited");
      if (res.status === 404 || (res.status === 400 && /model/i.test(res.text)))
        throw new AiError(`Model "${req.model}" is not available on this endpoint`, "unavailable_model");
      if (res.status >= 300) throw new AiError(`AI request failed (HTTP ${res.status})`, "bad_response");
      const data = JSON.parse(res.text);
      const text = data?.choices?.[0]?.message?.content;
      if (typeof text !== "string") throw new AiError("AI response had no message content", "bad_response");
      // Reasoning content (if any) is deliberately ignored and never stored or displayed.
      return {
        text,
        tokensIn: Number(data?.usage?.prompt_tokens ?? 0),
        tokensOut: Number(data?.usage?.completion_tokens ?? 0),
        latencyMs: Date.now() - started,
        model: String(data?.model ?? req.model),
      };
    } catch (e) {
      throw wrap(e);
    }
  }
}

function wrap(e: unknown): AiError {
  if (e instanceof AiError) return e;
  if (e instanceof SafeFetchError) return new AiError(e.message, e.kind === "timeout" ? "timeout" : e.kind === "blocked" ? "blocked" : "network");
  if (e instanceof SyntaxError) return new AiError("AI response was not valid JSON", "bad_response");
  return new AiError(e instanceof Error ? e.message : String(e), "network");
}
