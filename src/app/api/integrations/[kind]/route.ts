import { z } from "zod";
import { api } from "@/server/http";
import { db } from "@/server/db";
import { putSecret, deleteSecret, getSecret } from "@/server/crypto/secrets";
import { HttpError } from "@/server/auth/access";
import { audit } from "@/server/audit";
import { liveProvider, messagingSettingsSchema, getMessagingSettings } from "@/server/providers/messaging/registry";
import { aiSettingsSchema, buildProvider, getAiSettings, estimateCostMicros, todayKey } from "@/server/ai/config";
import { AiError } from "@/server/ai/types";
import { validateOutboundUrl } from "@/server/net/safeFetch";
import { sendTelegram } from "@/server/notify/telegram";
import { enqueue } from "@/server/queue/jobs";

const keyField = z.string().trim().min(8).max(500);

async function recordTest(id: string, provider: string, ok: boolean, detail: string) {
  await db().integrationConfig.upsert({
    where: { id },
    create: { id, provider, lastTestAt: new Date(), lastTestOk: ok, lastTestDetail: detail.slice(0, 300) },
    update: { lastTestAt: new Date(), lastTestOk: ok, lastTestDetail: detail.slice(0, 300) },
  });
}

const messaging = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save_key"), key: keyField }),
  z.object({ action: z.literal("delete_key") }),
  z.object({ action: z.literal("save_webhook_secret"), secret: keyField }),
  z.object({ action: z.literal("save_settings"), settings: messagingSettingsSchema }),
  z.object({ action: z.literal("test") }),
  z.object({ action: z.literal("list_accounts") }),
  z.object({ action: z.literal("select_account"), externalAccountId: z.string().min(1).max(100), displayName: z.string().min(1).max(80) }),
  z.object({ action: z.literal("client_session"), displayName: z.string().min(1).max(80) }),
  z.object({ action: z.literal("disconnect"), accountId: z.string(), remote: z.boolean() }),
  z.object({ action: z.literal("sync_now"), accountId: z.string() }),
]);
const ai = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save_key"), key: keyField, slot: z.enum(["primary", "alternate"]) }),
  z.object({ action: z.literal("delete_key"), slot: z.enum(["primary", "alternate"]) }),
  z.object({ action: z.literal("save_settings"), settings: aiSettingsSchema.omit({ verifiedModel: true }) }),
  z.object({ action: z.literal("test"), slot: z.enum(["primary", "alternate"]) }),
]);
const telegram = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save_token"), token: keyField }),
  z.object({ action: z.literal("delete_token") }),
  z.object({ action: z.literal("save_settings"), enabled: z.boolean(), chatId: z.string().trim().max(40).regex(/^-?\d*$/, "Chat id is numeric"), kinds: z.array(z.string()).max(10) }),
  z.object({ action: z.literal("test") }),
  z.object({ action: z.literal("in_app_test") }),
]);

export const POST = api({ auth: "owner" }, async ({ user, params, req }) => {
  const raw = await req.json().catch(() => {
    throw new HttpError(400, "Body must be JSON");
  });
  if (params.kind === "messaging") {
    const b = messaging.parse(raw);
    switch (b.action) {
      case "save_key":
        await putSecret("messaging.onlyfansapi_com", b.key);
        await audit("secret.saved", { actorId: user.id, target: "messaging.onlyfansapi_com" });
        return { ok: true };
      case "delete_key":
        await deleteSecret("messaging.onlyfansapi_com");
        await audit("secret.deleted", { actorId: user.id, target: "messaging.onlyfansapi_com" });
        return { ok: true };
      case "save_webhook_secret":
        await putSecret("messaging.webhook_signing", b.secret);
        await audit("secret.saved", { actorId: user.id, target: "messaging.webhook_signing" });
        return { ok: true };
      case "save_settings":
        await db().integrationConfig.upsert({ where: { id: "messaging" }, create: { id: "messaging", provider: "onlyfansapi_com", settings: b.settings }, update: { settings: b.settings } });
        await audit("integration.messaging.settings", { actorId: user.id, details: b.settings });
        return { ok: true };
      case "test": {
        const p = await liveProvider();
        const r = await p.testConnection();
        await recordTest("messaging", "onlyfansapi_com", r.ok, r.detail);
        return r;
      }
      case "list_accounts":
        return { accounts: await (await liveProvider()).listAccounts() };
      case "select_account": {
        const p = await liveProvider();
        const remote = (await p.listAccounts()).find((a) => a.externalAccountId === b.externalAccountId);
        if (!remote) throw new HttpError(404, "That account id is not connected on the provider");
        const acct = await db().creatorAccount.upsert({
          where: { provider_externalAccountId: { provider: "ONLYFANSAPI_COM", externalAccountId: b.externalAccountId } },
          create: { provider: "ONLYFANSAPI_COM", externalAccountId: b.externalAccountId, displayName: b.displayName, connectionStatus: remote.status, connectionDetail: remote.detail },
          update: { displayName: b.displayName, connectionStatus: remote.status, connectionDetail: remote.detail },
        });
        await db().$transaction((tx) => enqueue(tx, { type: "sync_account", payload: { accountId: acct.id }, dedupeKey: `sync:${acct.id}` }));
        await audit("account.selected", { actorId: user.id, target: acct.id });
        return { accountId: acct.id, status: remote.status };
      }
      case "client_session": {
        const p = await liveProvider();
        const token = await p.createClientSession(b.displayName, `ci_${user.id.slice(-6)}_${Date.now()}`);
        await audit("account.client_session", { actorId: user.id });
        // Short-lived token for the provider's own hosted login modal. Not stored.
        return { token };
      }
      case "disconnect": {
        const acct = await db().creatorAccount.findUniqueOrThrow({ where: { id: b.accountId } });
        if (acct.isSimulated) throw new HttpError(400, "Simulated accounts can't be disconnected; reset the simulator instead");
        if (b.remote && acct.externalAccountId) await (await liveProvider()).disconnect(acct.externalAccountId);
        await db().creatorAccount.update({ where: { id: acct.id }, data: { connectionStatus: "DISCONNECTED", connectionDetail: b.remote ? "Disconnected on provider" : "Disconnected locally" } });
        await db().job.updateMany({ where: { dedupeKey: `sync:${acct.id}`, status: "PENDING" }, data: { status: "CANCELLED", finishedAt: new Date() } });
        await audit("account.disconnected", { actorId: user.id, target: acct.id, details: { remote: b.remote } });
        return { ok: true };
      }
      case "sync_now":
        await db().$transaction((tx) => enqueue(tx, { type: "sync_account", payload: { accountId: b.accountId }, dedupeKey: `sync:${b.accountId}` }));
        return { ok: true };
    }
  }
  if (params.kind === "ai") {
    const b = ai.parse(raw);
    const slot = "slot" in b ? b.slot : "primary";
    const secretId = slot === "primary" ? "ai.primary" : "ai.alternate";
    switch (b.action) {
      case "save_key":
        await putSecret(secretId, b.key);
        await audit("secret.saved", { actorId: user.id, target: secretId });
        return { ok: true };
      case "delete_key":
        await deleteSecret(secretId);
        await audit("secret.deleted", { actorId: user.id, target: secretId });
        return { ok: true };
      case "save_settings": {
        if (b.settings.provider === "openai_compatible") validateOutboundUrl(b.settings.baseUrl);
        if (b.settings.alternate.enabled && b.settings.alternate.provider === "openai_compatible") validateOutboundUrl(b.settings.alternate.baseUrl);
        const prev = await getAiSettings();
        // Any provider/model/base-URL change must pass a new connection test before use.
        const same = prev.provider === b.settings.provider && prev.replyModel === b.settings.replyModel && prev.baseUrl === b.settings.baseUrl;
        const sameAlt = prev.alternate.model === b.settings.alternate.model && prev.alternate.baseUrl === b.settings.alternate.baseUrl && prev.alternate.provider === b.settings.alternate.provider;
        const settings = { ...b.settings, verifiedModel: same ? prev.verifiedModel : null, alternate: { ...b.settings.alternate, verifiedModel: sameAlt ? prev.alternate.verifiedModel : null } };
        await db().integrationConfig.upsert({ where: { id: "ai" }, create: { id: "ai", provider: settings.provider, settings, enabled: true }, update: { provider: settings.provider, settings } });
        await audit("integration.ai.settings", { actorId: user.id, details: { provider: settings.provider, model: settings.replyModel, retestRequired: !same } });
        return { ok: true, retestRequired: !same && settings.provider !== "offline" };
      }
      case "test": {
        const s = await getAiSettings();
        const conf = slot === "primary" ? { provider: s.provider, baseUrl: s.baseUrl, model: s.replyModel } : { provider: s.alternate.provider, baseUrl: s.alternate.baseUrl, model: s.alternate.model };
        if (conf.provider === "offline") return { ok: true, detail: "Offline simulator rules need no connection." };
        const key = await getSecret(secretId);
        if (!key) throw new HttpError(400, "Save an API key first");
        const p = buildProvider(conf.provider, conf.baseUrl, key);
        let detail = "";
        let ok = false;
        try {
          const models = await p.listModels();
          if (models && !models.includes(conf.model)) {
            detail = `Model "${conf.model}" is not offered by this endpoint. Available: ${models.slice(0, 12).join(", ")}`;
          } else {
            const r = await p.complete({ messages: [{ role: "system", content: 'Reply with json {"ok":true}' }, { role: "user", content: "json please" }], model: conf.model, json: true, maxTokens: 20, timeoutMs: s.timeoutMs, thinking: s.thinking, temperature: null });
            ok = true;
            detail = `Model "${r.model}" answered in ${r.latencyMs} ms${models ? "" : " (endpoint does not list models)"}.`;
            await db().aiUsage.create({ data: { day: todayKey(), provider: p.id, model: r.model, purpose: "test", tokensIn: r.tokensIn, tokensOut: r.tokensOut, costMicros: estimateCostMicros(s, r.model, r.tokensIn, r.tokensOut), latencyMs: r.latencyMs, ok: true } });
          }
        } catch (e) {
          detail = e instanceof AiError ? e.message : "Connection failed";
        }
        const next = slot === "primary" ? { ...s, verifiedModel: ok ? conf.model : null } : { ...s, alternate: { ...s.alternate, verifiedModel: ok ? conf.model : null } };
        await db().integrationConfig.update({ where: { id: "ai" }, data: { settings: next } }).catch(() => {});
        await recordTest("ai", conf.provider, ok, detail);
        return { ok, detail };
      }
    }
  }
  if (params.kind === "telegram") {
    const b = telegram.parse(raw);
    switch (b.action) {
      case "save_token":
        await putSecret("telegram.bot", b.token);
        await audit("secret.saved", { actorId: user.id, target: "telegram.bot" });
        return { ok: true };
      case "delete_token":
        await deleteSecret("telegram.bot");
        await audit("secret.deleted", { actorId: user.id, target: "telegram.bot" });
        return { ok: true };
      case "save_settings":
        await db().integrationConfig.upsert({ where: { id: "telegram" }, create: { id: "telegram", provider: "telegram", enabled: b.enabled, settings: { chatId: b.chatId, kinds: b.kinds } }, update: { enabled: b.enabled, settings: { chatId: b.chatId, kinds: b.kinds } } });
        await audit("integration.telegram.settings", { actorId: user.id, details: { enabled: b.enabled } });
        return { ok: true };
      case "in_app_test":
        await db().notification.create({ data: { kind: "test", title: "Notification test", body: "In-app notifications work. No customer data included.", link: "/activity" } });
        return { ok: true, detail: "In-app test notification created" };
      case "test": {
        const token = await getSecret("telegram.bot");
        const cfg = await db().integrationConfig.findUnique({ where: { id: "telegram" } });
        const chatId = String((cfg?.settings as any)?.chatId ?? "");
        if (!token || !chatId) throw new HttpError(400, "Save a bot token and chat id first");
        const r = await sendTelegram(token, chatId, "Creator Inbox test notification ✅\nNo customer data is included.");
        await recordTest("telegram", "telegram", r.ok, r.ok ? "Test message delivered" : r.error);
        await db().notification.create({ data: { kind: "test", title: "Notification test", body: r.ok ? "Telegram test delivered" : `Telegram test failed: ${r.error}` } });
        return r.ok ? { ok: true, detail: "Test message delivered" } : { ok: false, detail: r.error };
      }
    }
  }
  throw new HttpError(404, "Unknown integration");
});
