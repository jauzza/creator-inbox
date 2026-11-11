import { createHmac } from "node:crypto";
import { safeFetch, SafeFetchError, type HttpResponse } from "../../net/safeFetch";
import { safeEqual, sha256 } from "../../crypto/secrets";
import type { ConnectionStatus } from "@/generated/prisma/client";
import { ProviderError, stripHtml, type MessagingProvider, type ProviderAccount, type ProviderMessage, type SendOutcome, type WebhookEventParsed } from "./types";

/**
 * Fans API (onlyfansapi.com → fansapi.com) adapter, written from the public docs and the
 * Apache-2.0 TypeScript SDK on 2026-11-11. NOT verified against a live account. Unknown
 * response shapes fail closed (errors / UNCERTAIN sends), never as fake success.
 */
export const FANSAPI_HOSTS = ["app.onlyfansapi.com", "api.fansapi.com"];

export class FansApiProvider implements MessagingProvider {
  readonly kind = "ONLYFANSAPI_COM" as const;
  readonly label = "Fans API (onlyfansapi.com) · third-party, not affiliated with OnlyFans";
  readonly isSimulated = false;
  readonly capabilities = {
    webhooks: true,
    polling: true,
    idempotentSend: true,
    typingIndicator: false as const,
    readReceipts: false as const,
    paidMessagesViaApi: false as const,
    hostedConnect: true,
  };

  constructor(
    private baseUrl: string,
    private apiKey: string,
    private webhookSecret: string | null,
  ) {
    const host = new URL(baseUrl).hostname;
    if (!FANSAPI_HOSTS.includes(host)) throw new ProviderError(`Base URL host must be one of ${FANSAPI_HOSTS.join(", ")}`, "forbidden");
  }

  private async req(method: "GET" | "POST" | "DELETE", path: string, body?: unknown, extraHeaders: Record<string, string> = {}, timeoutMs = 20000) {
    const res = await safeFetch({
      url: this.baseUrl.replace(/\/+$/, "") + path,
      method,
      headers: { authorization: `Bearer ${this.apiKey}`, accept: "application/json", ...(body ? { "content-type": "application/json" } : {}), ...extraHeaders },
      body: body ? JSON.stringify(body) : undefined,
      timeoutMs,
      allowHosts: FANSAPI_HOSTS,
    });
    return res;
  }

  private json(res: HttpResponse) {
    try {
      return JSON.parse(res.text);
    } catch {
      throw new ProviderError(`Provider returned non-JSON (HTTP ${res.status})`, "bad_response");
    }
  }

  private check(res: HttpResponse) {
    if (res.status === 401) throw new ProviderError("Provider rejected the API key (401)", "auth");
    if (res.status === 403) throw new ProviderError("Provider denied access (403)", "forbidden");
    if (res.status === 404) throw new ProviderError("Not found on provider (404). The account may be disconnected.", "not_found");
    if (res.status === 429) throw new ProviderError("Provider rate limit reached (429)", "rate_limited");
    if (res.status >= 300) throw new ProviderError(`Provider error (HTTP ${res.status})`, "bad_response");
    return this.json(res);
  }

  async testConnection() {
    try {
      const data = this.check(await this.req("GET", "/api/whoami"));
      const team = data?.data?.team?.name ?? data?.team?.name;
      return { ok: true, detail: `Provider key accepted${team ? ` (team: ${String(team).slice(0, 60)})` : ""}.` };
    } catch (e) {
      return { ok: false, detail: e instanceof Error ? e.message : String(e) };
    }
  }

  async listAccounts(): Promise<ProviderAccount[]> {
    const data = this.check(await this.req("GET", "/api/accounts"));
    const list: any[] = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
    return list.map((a) => ({
      externalAccountId: String(a.id),
      displayName: String(a.display_name ?? a.onlyfans_username ?? a.username ?? a.id).slice(0, 80),
      status: mapAuthState(a.is_authenticated, a.authentication_progress),
      detail: a.authentication_progress ? `Provider state: ${String(a.authentication_progress).slice(0, 60)}` : undefined,
    }));
  }

  async listChats(acct: string, page: { offset: number; limit: number }) {
    const data = this.check(await this.req("GET", `/api/${enc(acct)}/chats?limit=${page.limit}&offset=${page.offset}&order=recent`));
    const list: any[] = Array.isArray(data?.data) ? data.data : Array.isArray(data?.data?.list) ? data.data.list : [];
    const chats = list
      .map((c) => {
        const fan = c.fan ?? c.withUser ?? c.user ?? {};
        const id = fan.id ?? c.id;
        if (id == null) return null;
        return {
          externalChatId: String(id),
          customerExternalId: String(fan.id ?? id),
          customerName: String(fan.name ?? fan.username ?? `Fan ${id}`).slice(0, 80),
          lastMessageAt: c.lastMessage?.createdAt ? new Date(c.lastMessage.createdAt) : undefined,
        };
      })
      .filter(Boolean) as any[];
    const hasMore = !!(data?._pagination?.next_page ?? data?.data?.hasMore);
    return { chats, hasMore };
  }

  async listMessages(acct: string, chatId: string, limit: number): Promise<ProviderMessage[]> {
    const data = this.check(await this.req("GET", `/api/${enc(acct)}/chats/${enc(chatId)}/messages?limit=${Math.min(limit, 100)}&order=desc`));
    const list: any[] = Array.isArray(data?.data) ? data.data : Array.isArray(data?.data?.list) ? data.data.list : [];
    return list
      .filter((m) => m?.id != null && typeof m.text === "string")
      .map((m) => ({
        externalId: String(m.id),
        direction: String(m.fromUser?.id ?? "") === String(chatId) ? ("INBOUND" as const) : ("OUTBOUND" as const),
        body: stripHtml(m.text),
        sentAt: new Date(m.createdAt ?? Date.now()),
      }));
  }

  async sendText(acct: string, chatId: string, text: string, idempotencyKey: string): Promise<SendOutcome> {
    let res: HttpResponse;
    try {
      res = await this.req("POST", `/api/${enc(acct)}/chats/${enc(chatId)}/messages`, { text }, { "Idempotency-Key": idempotencyKey }, 30000);
    } catch (e) {
      if (e instanceof SafeFetchError && e.kind === "blocked") return { status: "rejected", error: e.message };
      // Timeout / connection reset: the provider may or may not have accepted it.
      return { status: "unknown", error: e instanceof Error ? e.message : String(e) };
    }
    if (res.status >= 200 && res.status < 300) {
      let id: unknown;
      try {
        const d = JSON.parse(res.text);
        id = d?.data?.id ?? d?.id;
      } catch {
        /* fall through */
      }
      if (id == null) return { status: "unknown", error: "Provider accepted the request but returned no message id" };
      return { status: "accepted", providerMessageId: String(id), replayed: res.headers["idempotent-replayed"] === "true" };
    }
    if (res.status === 429) {
      const ra = Number(res.headers["retry-after"]);
      return { status: "retryable_not_sent", error: "Rate limited (429)", retryAfterMs: Number.isFinite(ra) ? ra * 1000 : 30000 };
    }
    if (res.status === 503) {
      if (/not_sent/i.test(res.text)) return { status: "retryable_not_sent", error: "Provider reports not_sent (503)" };
      return { status: "unknown", error: "Provider reports unknown delivery state (503); do not resend before reconciling" };
    }
    if (res.status === 409) return { status: "unknown", error: "Idempotency conflict (409): an earlier attempt is still processing" };
    if (res.status >= 500) return { status: "unknown", error: `Provider error ${res.status}; delivery state unknown` };
    return { status: "rejected", error: `Provider rejected the message (HTTP ${res.status})` };
  }

  async findSent(acct: string, chatId: string, text: string, after: Date) {
    try {
      const msgs = await this.listMessages(acct, chatId, 30);
      const norm = (s: string) => s.replace(/\s+/g, " ").trim();
      const hit = msgs.find((m) => m.direction === "OUTBOUND" && norm(m.body) === norm(text) && m.sentAt.getTime() >= after.getTime() - 120000);
      return hit ? { providerMessageId: hit.externalId } : false;
    } catch {
      return null;
    }
  }

  async verifyWebhook(rawBody: string, headers: Headers) {
    if (!this.webhookSecret) return false; // we require a signing secret; unsigned webhooks are rejected
    const sig = (headers.get("signature") ?? "").trim().toLowerCase();
    const expected = createHmac("sha256", this.webhookSecret).update(rawBody).digest("hex");
    return sig.length > 0 && safeEqual(sig, expected);
  }

  parseWebhook(rawBody: string, headers: Headers): WebhookEventParsed[] {
    const b = JSON.parse(rawBody);
    const eventId = headers.get("x-ofapi-idempotency-key") ?? sha256(rawBody);
    const acct = String(b.account_id ?? "");
    const p = b.payload ?? {};
    switch (b.event) {
      case "messages.received": {
        const from = p.fromUser ?? {};
        if (p.id == null || from.id == null) return [{ kind: "ignored", eventId, type: "messages.received(malformed)" }];
        return [
          {
            kind: "message",
            eventId,
            accountExtId: acct,
            chatId: String(from.id),
            customerName: from.name ?? from.username,
            message: { externalId: String(p.id), direction: "INBOUND", body: stripHtml(String(p.text ?? "")), sentAt: new Date(p.createdAt ?? Date.now()) },
          },
        ];
      }
      case "messages.sent": {
        const to = p.toUser ?? {};
        if (p.id == null || to.id == null) return [{ kind: "ignored", eventId, type: "messages.sent(malformed)" }];
        return [
          {
            kind: "message",
            eventId,
            accountExtId: acct,
            chatId: String(to.id),
            message: { externalId: String(p.id), direction: "OUTBOUND", body: stripHtml(String(p.text ?? "")), sentAt: new Date(p.createdAt ?? Date.now()) },
          },
        ];
      }
      case "accounts.connected":
      case "accounts.reconnected":
        return [{ kind: "account_status", eventId, accountExtId: acct, status: "CONNECTED", detail: b.event }];
      case "accounts.disconnected":
        return [{ kind: "account_status", eventId, accountExtId: acct, status: "DISCONNECTED", detail: b.event }];
      case "accounts.session_expired":
      case "accounts.authentication_failed":
        return [{ kind: "account_status", eventId, accountExtId: acct, status: "REAUTH_REQUIRED", detail: b.event }];
      case "accounts.otp_code_required":
        return [{ kind: "account_status", eventId, accountExtId: acct, status: "TWO_FACTOR_REQUIRED", detail: b.event }];
      case "accounts.face_otp_required":
        return [{ kind: "account_status", eventId, accountExtId: acct, status: "VERIFICATION_REQUIRED", detail: b.event }];
      default:
        return [{ kind: "ignored", eventId, type: String(b.event) }];
    }
  }

  /** Server-side half of the provider's hosted "Login with OnlyFans" flow. Returns a short-lived token for the provider's modal. */
  async createClientSession(displayName: string, reference: string) {
    const data = this.check(await this.req("POST", "/api/client-sessions", { display_name: displayName, client_reference_id: reference }));
    const token = data?.data?.token ?? data?.token;
    if (typeof token !== "string") throw new ProviderError("Provider did not return a client-session token", "bad_response");
    return token;
  }

  async disconnect(acct: string) {
    this.check(await this.req("DELETE", `/api/accounts/${enc(acct)}`));
  }
}

function enc(s: string) {
  return encodeURIComponent(s);
}

function mapAuthState(isAuth: unknown, progress: unknown): ConnectionStatus {
  const p = String(progress ?? "").toLowerCase();
  if (isAuth === true) return "CONNECTED";
  if (p.includes("otp") || p.includes("2fa")) return "TWO_FACTOR_REQUIRED";
  if (p.includes("face") || p.includes("verif")) return "VERIFICATION_REQUIRED";
  if (p.includes("expired")) return "REAUTH_REQUIRED";
  if (isAuth === false) return "REAUTH_REQUIRED";
  return "PENDING";
}
