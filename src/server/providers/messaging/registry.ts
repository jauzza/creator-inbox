import { z } from "zod";
import { db } from "../../db";
import { getSecret } from "../../crypto/secrets";
import { SimulatorProvider } from "./simulator";
import { FansApiProvider, FANSAPI_HOSTS } from "./fansapi";
import { ProviderError, type MessagingProvider } from "./types";

export const messagingSettingsSchema = z.object({
  baseUrl: z
    .string()
    .url()
    .refine((u) => u.startsWith("https://") && FANSAPI_HOSTS.includes(new URL(u).hostname), `Must be https:// on ${FANSAPI_HOSTS.join(" or ")}`),
  pollIntervalSec: z.number().int().min(30).max(3600),
  pollEnabled: z.boolean(),
});
export type MessagingSettings = z.infer<typeof messagingSettingsSchema>;
export const DEFAULT_MESSAGING: MessagingSettings = { baseUrl: "https://app.onlyfansapi.com", pollIntervalSec: 120, pollEnabled: true };

export async function getMessagingSettings(): Promise<MessagingSettings> {
  const row = await db().integrationConfig.findUnique({ where: { id: "messaging" } });
  const p = messagingSettingsSchema.safeParse({ ...DEFAULT_MESSAGING, ...((row?.settings as object) ?? {}) });
  return p.success ? p.data : DEFAULT_MESSAGING;
}

export async function liveProvider(): Promise<FansApiProvider> {
  const key = await getSecret("messaging.onlyfansapi_com");
  if (!key) throw new ProviderError("No messaging provider API key saved (Integrations → Messaging)", "not_configured");
  const s = await getMessagingSettings();
  return new FansApiProvider(s.baseUrl, key, await getSecret("messaging.webhook_signing"));
}

/**
 * Provider selection is driven ONLY by the account's stored provider kind, and simulated accounts
 * are hard-wired to the simulator. A simulated account can never be routed to a live endpoint.
 */
export async function providerForAccount(account: { provider: string; isSimulated: boolean }): Promise<MessagingProvider> {
  if (account.isSimulated || account.provider === "SIMULATOR") return new SimulatorProvider();
  if (account.provider === "ONLYFANSAPI_COM") return liveProvider();
  throw new ProviderError(`Unknown provider ${account.provider}`, "not_configured");
}
