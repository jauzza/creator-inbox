import { api } from "@/server/http";
import { db } from "@/server/db";
import { secretStatus } from "@/server/crypto/secrets";

/** Walkthrough progress is derived from real actions (audit log + data), not self-reported ticks. */
export const GET = api({ auth: "user" }, async () => {
  const has = async (prefix: string) => (await db().auditLog.count({ where: { action: { startsWith: prefix } } })) > 0;
  const ai = await db().integrationConfig.findUnique({ where: { id: "ai" } });
  const aiSettings = (ai?.settings ?? {}) as any;
  return {
    steps: {
      launch: true,
      login: true,
      simulator: await has("simulator."),
      provider: (await secretStatus("messaging.onlyfansapi_com")).set,
      ai: !!ai?.lastTestOk || aiSettings.provider === "offline" || !ai,
      aiLive: !!ai?.lastTestOk,
      style: (await db().aiUsage.count({ where: { purpose: "preview" } })) > 0,
      timing: await has("automation.rules"),
      approve: await has("draft.approved"),
      pause: await has("conversation.mode"),
      stop: await has("automation.emergency_stop.on"),
      scoring: (await db().intentSignal.count()) > 0,
      notify: (await db().notification.count({ where: { kind: "test" } })) > 0,
      takeover: (await has("conversation.takeover")) && (await has("conversation.resume")),
    },
  };
});
