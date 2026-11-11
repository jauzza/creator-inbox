import { db } from "../db";
import { secretStatus } from "../crypto/secrets";
import { getAiSettings } from "../ai/config";
import { HttpError } from "../auth/access";
import { audit } from "../audit";

export /** First-run status, derived from real data (not self-reported ticks). */
async function onboardingStatus(userId: string) {
  const [user, live, ai, aiTest] = await Promise.all([
    db().user.findUniqueOrThrow({ where: { id: userId } }),
    db().creatorAccount.findMany({ where: { isSimulated: false }, include: { styleProfiles: { where: { active: true }, select: { version: true } }, catalog: { where: { active: true }, select: { id: true } } }, orderBy: { createdAt: "asc" } }),
    getAiSettings(),
    db().integrationConfig.findUnique({ where: { id: "ai" } }),
  ]);
  const has = async (prefix: string) => (await db().auditLog.count({ where: { action: { startsWith: prefix } } })) > 0;
  return {
    onboarded: !!user.onboardedAt,
    tourDone: !!user.tourCompletedAt,
    setup: {
      messagingKey: (await secretStatus("messaging.onlyfansapi_com")).set,
      models: live.map((a) => ({ id: a.id, name: a.displayName, connected: a.connectionStatus === "CONNECTED", personality: a.styleProfiles.length > 0, ppvItems: a.catalog.length })),
      aiReady: ai.provider !== "offline" && ai.verifiedModel === ai.replyModel && !!aiTest?.lastTestOk,
      aiProvider: ai.provider,
    },
    steps: {
      approve: await has("draft.approved"),
      style: await has("style.saved"),
    },
  };
}


/** Finish first-run setup. The owner must connect a real account; the AI may start on sample replies only if they say so. */
export async function completeOnboarding(user: { id: string; role: "OWNER" | "OPERATOR" }, acceptSampleReplies?: boolean) {
  const s = await onboardingStatus(user.id);
  if (user.role === "OWNER") {
    if (!s.setup.models.some((m) => m.connected)) throw new HttpError(409, "Connect at least one creator account first.");
    if (!s.setup.aiReady && !acceptSampleReplies) throw new HttpError(409, "Connect and test an AI model first, or choose to start with sample replies.");
  } else if (s.setup.models.length === 0) {
    throw new HttpError(409, "The account owner hasn't connected a creator account yet.");
  }
  await db().user.update({ where: { id: user.id }, data: { onboardedAt: new Date() } });
  await audit("onboarding.complete", { actorId: user.id, details: { aiReady: s.setup.aiReady } });
}

export async function finishTour(userId: string) {
  await db().user.update({ where: { id: userId }, data: { tourCompletedAt: new Date() } });
  await audit("onboarding.tour_done", { actorId: userId });
}
