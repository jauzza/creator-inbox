import { api } from "@/server/http";
import { db } from "@/server/db";
import { secretStatus } from "@/server/crypto/secrets";
import { getAiSettings } from "@/server/ai/config";
import { getMessagingSettings } from "@/server/providers/messaging/registry";
import { env } from "@/server/env";

export const GET = api({ auth: "user" }, async () => {
  const configs = Object.fromEntries((await db().integrationConfig.findMany()).map((c) => [c.id, c]));
  const t = (id: string) => (configs[id] ? { at: configs[id].lastTestAt, ok: configs[id].lastTestOk, detail: configs[id].lastTestDetail } : null);
  const accounts = await db().creatorAccount.findMany({ orderBy: { createdAt: "asc" } });
  return {
    messaging: {
      provider: "Fans API (onlyfansapi.com / fansapi.com)",
      note: "Independent third-party service. Its API key is NOT an OnlyFans key, and API availability is not platform permission.",
      settings: await getMessagingSettings(),
      key: await secretStatus("messaging.onlyfansapi_com"),
      webhookSecret: await secretStatus("messaging.webhook_signing"),
      webhookUrl: `${env().APP_URL}/api/webhooks/onlyfansapi_com`,
      lastTest: t("messaging"),
    },
    accounts: accounts.map((a) => ({ id: a.id, displayName: a.displayName, provider: a.provider, isSimulated: a.isSimulated, externalAccountId: a.externalAccountId, connectionStatus: a.connectionStatus, connectionDetail: a.connectionDetail, lastSyncAt: a.lastSyncAt, lastSyncOkAt: a.lastSyncOkAt, lastSyncError: a.lastSyncError })),
    ai: { settings: await getAiSettings(), key: await secretStatus("ai.primary"), alternateKey: await secretStatus("ai.alternate"), lastTest: t("ai") },
    telegram: { enabled: configs.telegram?.enabled ?? false, settings: configs.telegram?.settings ?? { chatId: "", kinds: ["handoff", "send_failed", "send_uncertain", "budget", "connection", "test"] }, token: await secretStatus("telegram.bot"), lastTest: t("telegram") },
  };
});
