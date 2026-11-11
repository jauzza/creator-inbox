import { describe, it, expect, afterEach } from "vitest";
import { createHmac } from "node:crypto";
import { FansApiProvider } from "@/server/providers/messaging/fansapi";
import { setTransport, type HttpRequest } from "@/server/net/safeFetch";
import { OpenAiCompatibleProvider } from "@/server/ai/openaiCompatible";

const calls: HttpRequest[] = [];
function mock(status: number, body: unknown, headers: Record<string, string> = {}) {
  setTransport(async (req) => {
    calls.push(req);
    return { status, headers, text: typeof body === "string" ? body : JSON.stringify(body) };
  });
}
afterEach(() => {
  calls.length = 0;
  setTransport(null);
});
const p = () => new FansApiProvider("https://app.onlyfansapi.com", "test_key", "whsec_test");

describe("Fans API adapter (mocked transport; not live-verified)", () => {
  it("refuses base URLs outside the documented hosts", () => {
    expect(() => new FansApiProvider("https://evil.example.com", "k", null)).toThrow(/must be one of/);
  });
  it("sends with Bearer auth and an Idempotency-Key", async () => {
    mock(200, { data: { id: 987 } });
    const r = await p().sendText("acct_1", "123", "hello", "draft_abc");
    expect(r).toEqual({ status: "accepted", providerMessageId: "987", replayed: false });
    expect(calls[0].headers!["Idempotency-Key"]).toBe("draft_abc");
    expect(calls[0].headers!.authorization).toBe("Bearer test_key");
    expect(calls[0].url).toBe("https://app.onlyfansapi.com/api/acct_1/chats/123/messages");
  });
  it("maps 503 not_sent → retryable, 503 unknown → uncertain, 2xx without id → uncertain, 422 → rejected", async () => {
    mock(503, { error: { code: "not_sent" } });
    expect((await p().sendText("a", "1", "x", "k")).status).toBe("retryable_not_sent");
    mock(503, { error: { code: "unknown" } });
    expect((await p().sendText("a", "1", "x", "k")).status).toBe("unknown");
    mock(200, { data: {} });
    expect((await p().sendText("a", "1", "x", "k")).status).toBe("unknown");
    mock(422, { error: "bad" });
    expect((await p().sendText("a", "1", "x", "k")).status).toBe("rejected");
    mock(429, {}, { "retry-after": "7" });
    const rl = await p().sendText("a", "1", "x", "k");
    expect(rl).toMatchObject({ status: "retryable_not_sent", retryAfterMs: 7000 });
  });
  it("timeouts are ambiguous, never 'sent'", async () => {
    setTransport(async () => {
      throw new Error("Request timed out");
    });
    expect((await p().sendText("a", "1", "x", "k")).status).toBe("unknown");
  });
  it("verifies HMAC-SHA256 webhook signatures and parses events", async () => {
    const raw = JSON.stringify({ event: "messages.received", account_id: "acct_1", payload: { id: 5, text: "<p>hi &amp; bye</p>", createdAt: new Date().toISOString(), fromUser: { id: 42, name: "Fan" } } });
    const sig = createHmac("sha256", "whsec_test").update(raw).digest("hex");
    expect(await p().verifyWebhook(raw, new Headers({ signature: sig }))).toBe(true);
    expect(await p().verifyWebhook(raw, new Headers({ signature: "00" + sig.slice(2) }))).toBe(false);
    expect(await new FansApiProvider("https://app.onlyfansapi.com", "k", null).verifyWebhook(raw, new Headers({ signature: sig }))).toBe(false);
    const [ev] = p().parseWebhook(raw, new Headers({ "x-ofapi-idempotency-key": "evt1" }));
    expect(ev).toMatchObject({ kind: "message", eventId: "evt1", chatId: "42", message: { body: "hi & bye", direction: "INBOUND" } });
    const [st] = p().parseWebhook(JSON.stringify({ event: "accounts.otp_code_required", account_id: "acct_1" }), new Headers());
    expect(st).toMatchObject({ kind: "account_status", status: "TWO_FACTOR_REQUIRED" });
  });
  it("reconciles by finding an outbound message with the same text", async () => {
    mock(200, { data: [{ id: 77, text: "<p>hello</p>", createdAt: new Date().toISOString(), fromUser: { id: 999 } }] });
    expect(await p().findSent("a", "42", "hello", new Date(Date.now() - 1000))).toEqual({ providerMessageId: "77" });
  });
});

describe("AI adapter", () => {
  it("fails clearly on unknown models and auth errors; never returns reasoning content", async () => {
    const ai = new OpenAiCompatibleProvider("deepseek", "DeepSeek", "https://api.deepseek.com", "k");
    mock(400, { error: { message: "Model Not Exist" } });
    await expect(ai.complete({ messages: [], model: "nope", json: true, maxTokens: 10, timeoutMs: 1000 })).rejects.toMatchObject({ kind: "unavailable_model" });
    mock(401, {});
    await expect(ai.complete({ messages: [], model: "x", json: true, maxTokens: 10, timeoutMs: 1000 })).rejects.toMatchObject({ kind: "auth" });
    mock(200, { model: "deepseek-flash", choices: [{ message: { content: '{"a":1}', reasoning_content: "hidden" } }], usage: { prompt_tokens: 5, completion_tokens: 3 } });
    const r = await ai.complete({ messages: [], model: "deepseek-flash", json: true, maxTokens: 10, timeoutMs: 1000, thinking: "disabled" });
    expect(r.text).toBe('{"a":1}');
    expect(JSON.stringify(r)).not.toContain("hidden");
    expect(JSON.parse(calls.at(-1)!.body!).thinking).toEqual({ type: "disabled" });
  });
});
