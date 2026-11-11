import { db, Prisma } from "../db";
import { SimulatorProvider } from "../providers/messaging/simulator";
import { liveProvider } from "../providers/messaging/registry";
import type { MessagingProvider } from "../providers/messaging/types";
import { ingestInbound, ingestOutboundObserved } from "./ingest";
import { notify } from "../notify/notify";
import { audit, log } from "../audit";

const MAX_EVENT_AGE_MS = 24 * 3600 * 1000;

export type WebhookResult = { status: number; body: Record<string, unknown> };

/**
 * Verify → parse → dedupe → apply. Fans API signs with HMAC-SHA256 but sends no timestamp, so replay
 * protection is: permanent dedupe on the provider's event id, plus rejecting message events older than 24h.
 */
export async function processWebhook(kind: "simulator" | "onlyfansapi_com", rawBody: string, headers: Headers): Promise<WebhookResult> {
  let provider: MessagingProvider;
  try {
    provider = kind === "simulator" ? new SimulatorProvider() : await liveProvider();
  } catch {
    return { status: 503, body: { error: "Provider not configured" } };
  }
  if (rawBody.length > 256_000) return { status: 413, body: { error: "Payload too large" } };
  if (!(await provider.verifyWebhook(rawBody, headers))) {
    log("warn", "webhook_bad_signature", { kind });
    return { status: 401, body: { error: "Invalid signature" } };
  }
  let events;
  try {
    events = provider.parseWebhook(rawBody, headers);
  } catch {
    return { status: 400, body: { error: "Malformed payload" } };
  }
  const results: string[] = [];
  for (const ev of events) {
    try {
      await db().webhookEvent.create({ data: { provider: kind, eventId: ev.eventId, eventType: ev.kind } });
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
      const prev = await db().webhookEvent.findUnique({ where: { provider_eventId: { provider: kind, eventId: ev.eventId } } });
      // A previously FAILED event may be retried by the provider; anything else is a duplicate.
      if (!prev || prev.processedAt || !prev.error) {
        results.push("duplicate");
        continue;
      }
    }
    try {
      if (ev.kind === "message") {
        if (Date.now() - ev.message.sentAt.getTime() > MAX_EVENT_AGE_MS) {
          results.push("too_old");
          continue;
        }
        const account = await db().creatorAccount.findFirst({
          where: kind === "simulator" ? { isSimulated: true, OR: [{ externalAccountId: ev.accountExtId }, { id: ev.accountExtId }] } : { provider: "ONLYFANSAPI_COM", externalAccountId: ev.accountExtId, isSimulated: false },
        });
        if (!account) {
          results.push("unknown_account");
          continue;
        }
        if (ev.message.direction === "INBOUND") {
          const r = await ingestInbound({ accountId: account.id, chatId: ev.chatId, customerName: ev.customerName, message: ev.message });
          results.push(r.duplicate ? "duplicate_message" : "ingested");
        } else {
          await ingestOutboundObserved({ accountId: account.id, chatId: ev.chatId, message: ev.message });
          results.push("outbound_observed");
        }
      } else if (ev.kind === "account_status") {
        const account = await db().creatorAccount.findFirst({ where: { provider: "ONLYFANSAPI_COM", externalAccountId: ev.accountExtId } });
        if (account) {
          await db().creatorAccount.update({ where: { id: account.id }, data: { connectionStatus: ev.status, connectionDetail: ev.detail } });
          await audit("account.status_webhook", { target: account.id, details: { status: ev.status } });
          if (ev.status !== "CONNECTED")
            await db().$transaction((tx) =>
              notify(tx, { kind: "connection", title: `${account.displayName}: ${ev.status.toLowerCase().replace(/_/g, " ")}`, body: "Reconnect through the provider, then re-test under Integrations.", link: "/integrations", dedupeKey: `conn:${account.id}`, cooldownMin: 60 }),
            );
        }
        results.push("account_status");
      } else results.push("ignored");
      await db().webhookEvent.update({ where: { provider_eventId: { provider: kind, eventId: ev.eventId } }, data: { processedAt: new Date(), error: null } });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Keep the row with its error (visible in Troubleshooting); a provider retry will reprocess it.
      await db().webhookEvent.update({ where: { provider_eventId: { provider: kind, eventId: ev.eventId } }, data: { error: msg.slice(0, 300) } });
      log("error", "webhook_processing_failed", { kind, error: msg });
      return { status: 500, body: { error: "Processing failed; safe to retry" } };
    }
  }
  return { status: 200, body: { ok: true, results } };
}
