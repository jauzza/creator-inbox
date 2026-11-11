import { db } from "../db";
import { providerForAccount, getMessagingSettings } from "../providers/messaging/registry";
import { ingestInbound, ingestOutboundObserved } from "./ingest";
import { enqueue } from "../queue/jobs";
import { notify } from "../notify/notify";
import { log, audit } from "../audit";
import { ProviderError } from "../providers/messaging/types";

/**
 * Polling sync for live accounts (works without a public webhook URL, e.g. on a laptop).
 * Bounded per run: recent chats only. Re-enqueues itself at the configured interval.
 */
export async function syncAccount(accountId: string): Promise<{ outcome: string }> {
  const account = await db().creatorAccount.findUnique({ where: { id: accountId } });
  if (!account || account.isSimulated) return { outcome: "skipped" };
  const settings = await getMessagingSettings();
  const reschedule = () =>
    db().$transaction((tx) => enqueue(tx, { type: "sync_account", runAt: new Date(Date.now() + settings.pollIntervalSec * 1000), payload: { accountId }, dedupeKey: `sync:${accountId}` }));
  if (!settings.pollEnabled || account.connectionStatus !== "CONNECTED" || !account.externalAccountId) {
    return { outcome: "not polling (disabled or not connected)" };
  }
  await db().creatorAccount.update({ where: { id: accountId }, data: { lastSyncAt: new Date() } });
  try {
    const provider = await providerForAccount(account);
    const since = account.lastSyncOkAt ?? new Date(Date.now() - 24 * 3600 * 1000);
    let seen = 0;
    for (let offset = 0; offset < 200; offset += 50) {
      const { chats, hasMore } = await provider.listChats(account.externalAccountId, { offset, limit: 50 });
      const recent = chats.filter((c) => !c.lastMessageAt || c.lastMessageAt >= since);
      for (const chat of recent) {
        const msgs = await provider.listMessages(account.externalAccountId, chat.externalChatId, 30);
        for (const m of msgs.sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime())) {
          if (m.sentAt < new Date(since.getTime() - 3600_000)) continue;
          if (m.direction === "INBOUND")
            await ingestInbound({ accountId, chatId: chat.externalChatId, customerExternalId: chat.customerExternalId, customerName: chat.customerName, message: m });
          else await ingestOutboundObserved({ accountId, chatId: chat.externalChatId, message: m });
          seen++;
        }
      }
      if (!hasMore || recent.length < chats.length) break;
    }
    await db().creatorAccount.update({ where: { id: accountId }, data: { lastSyncOkAt: new Date(), lastSyncError: null } });
    await reschedule();
    return { outcome: `synced ${seen} messages` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = e instanceof ProviderError && e.kind === "not_found" ? "DISCONNECTED" : e instanceof ProviderError && e.kind === "auth" ? "ERROR" : account.connectionStatus;
    await db().creatorAccount.update({ where: { id: accountId }, data: { lastSyncError: msg.slice(0, 300), connectionStatus: status } });
    if (status !== account.connectionStatus) {
      await db().$transaction((tx) =>
        notify(tx, { kind: "connection", title: `Account ${account.displayName}: ${status.toLowerCase().replace("_", " ")}`, body: "Check Integrations → Messaging.", link: "/integrations", dedupeKey: `conn:${accountId}`, cooldownMin: 60 }),
      );
      await audit("account.status_changed", { target: accountId, details: { status, error: msg } });
    }
    log("warn", "sync_failed", { accountId, error: msg });
    await reschedule();
    return { outcome: `error: ${msg.slice(0, 120)}` };
  }
}
