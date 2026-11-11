import { createHmac, randomBytes } from "node:crypto";
import { db } from "../../db";
import { env } from "../../env";
import { safeEqual, sha256 } from "../../crypto/secrets";
import type { MessagingProvider, SendOutcome, WebhookEventParsed } from "./types";

/**
 * Simulated messaging provider. Lives entirely in our database: it performs NO network I/O,
 * so simulator data can never reach a live send endpoint. Failure modes are injected via SimulatorState.
 */
export class SimulatorProvider implements MessagingProvider {
  readonly kind = "SIMULATOR" as const;
  readonly label = "Simulator (no real messages)";
  readonly isSimulated = true;
  readonly capabilities = {
    webhooks: true,
    polling: false,
    idempotentSend: true,
    typingIndicator: false as const,
    readReceipts: false as const,
    paidMessagesViaApi: false as const,
    hostedConnect: false,
  };

  async testConnection() {
    return { ok: true, detail: "Simulator is always available. No external service is contacted." };
  }
  async listAccounts() {
    const rows = await db().creatorAccount.findMany({ where: { isSimulated: true } });
    return rows.map((r) => ({ externalAccountId: r.externalAccountId ?? r.id, displayName: r.displayName, status: "CONNECTED" as const }));
  }
  async listChats() {
    return { chats: [], hasMore: false }; // simulator conversations are created by injected events
  }
  async listMessages() {
    return [];
  }

  async sendText(_acct: string, chatId: string, text: string, idempotencyKey: string): Promise<SendOutcome> {
    const existing = await db().simulatorSent.findUnique({ where: { idempotencyKey } });
    if (existing) return { status: "accepted", providerMessageId: existing.providerMessageId, replayed: true };
    const state = await db().simulatorState.upsert({ where: { id: "sim" }, create: { id: "sim" }, update: {} });
    const failure = state.nextSendFailure;
    if (failure) await db().simulatorState.update({ where: { id: "sim" }, data: { nextSendFailure: null } });
    const record = () =>
      db().simulatorSent.create({ data: { idempotencyKey, externalChatId: chatId, body: text, providerMessageId: `sim_out_${randomBytes(6).toString("hex")}` } });
    switch (failure) {
      case "rejected":
        return { status: "rejected", error: "Simulated provider rejected the message (HTTP 422)" };
      case "rate_limited":
        return { status: "retryable_not_sent", error: "Simulated rate limit (HTTP 429)", retryAfterMs: 5000 };
      case "timeout_delivered":
        await record();
        return { status: "unknown", error: "Simulated timeout after the provider accepted the message" };
      case "timeout_lost":
        return { status: "unknown", error: "Simulated timeout; the provider never received the message" };
      default: {
        const row = await record();
        return { status: "accepted", providerMessageId: row.providerMessageId };
      }
    }
  }

  async findSent(_acct: string, chatId: string, text: string, after: Date) {
    const row = await db().simulatorSent.findFirst({ where: { externalChatId: chatId, body: text, createdAt: { gte: new Date(after.getTime() - 60000) } } });
    return row ? { providerMessageId: row.providerMessageId } : false;
  }

  static sign(rawBody: string) {
    return createHmac("sha256", env().SIMULATOR_WEBHOOK_SECRET).update(rawBody).digest("hex");
  }

  async verifyWebhook(rawBody: string, headers: Headers) {
    const sig = headers.get("signature") ?? "";
    return safeEqual(sig, SimulatorProvider.sign(rawBody));
  }

  parseWebhook(rawBody: string, headers: Headers): WebhookEventParsed[] {
    const b = JSON.parse(rawBody);
    const eventId = headers.get("x-event-id") ?? sha256(rawBody);
    if (b.event === "messages.received") {
      return [
        {
          kind: "message",
          eventId,
          accountExtId: String(b.account_id),
          chatId: String(b.payload.chat_id),
          customerName: b.payload.from_name,
          message: { externalId: String(b.payload.id), direction: "INBOUND", body: String(b.payload.text), sentAt: new Date(b.payload.created_at) },
        },
      ];
    }
    return [{ kind: "ignored", eventId, type: String(b.event) }];
  }
}
