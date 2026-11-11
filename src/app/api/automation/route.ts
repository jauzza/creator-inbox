import { z } from "zod";
import { api } from "@/server/http";
import { db } from "@/server/db";
import { getAutomation, rulesSchema } from "@/server/automation/settings";
import { setEmergencyStop, setGlobalMode, setAccountMode, setModelMode, modelMode } from "@/server/services/controls";
import { audit } from "@/server/audit";
import { HttpError, requireOwner } from "@/server/auth/access";

export const GET = api({ auth: "user" }, async () => {
  const a = await getAutomation();
  const rows = await db().creatorAccount.findMany({ select: { id: true, displayName: true, modeOverride: true, isSimulated: true, connectionStatus: true }, orderBy: { createdAt: "asc" } });
  const accounts = rows.map((r) => ({ ...r, mode: modelMode(a.globalMode, r.modeOverride) }));
  return { globalMode: a.globalMode, emergencyStop: a.emergencyStop, emergencyStopAt: a.emergencyStopAt, dailyAiBudgetMicros: a.dailyAiBudgetMicros, rules: a.rules, accounts };
});

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("emergency_stop"), on: z.boolean() }),
  z.object({ action: z.literal("global_mode"), mode: z.enum(["AUTO", "DRAFT", "PAUSED"]), confirm: z.boolean().optional() }),
  z.object({ action: z.literal("account_mode"), accountId: z.string(), mode: z.enum(["AUTO", "DRAFT", "MANUAL", "PAUSED"]).nullable() }),
  z.object({ action: z.literal("rules"), rules: rulesSchema }),
  z.object({ action: z.literal("model_mode"), accountId: z.string(), mode: z.enum(["AUTO", "DRAFT", "PAUSED"]), confirm: z.boolean().optional() }),
  z.object({ action: z.literal("budget"), dailyAiBudgetMicros: z.number().int().min(0).max(1_000_000_000) }),
]);

export const POST = api({ auth: "user", body }, async ({ user, body }) => {
  // Anyone signed in may hit the emergency stop; everything else is owner-only.
  if (body.action === "emergency_stop") {
    if (!body.on) requireOwner(user);
    return setEmergencyStop(user.id, body.on);
  }
  requireOwner(user);
  switch (body.action) {
    case "global_mode":
      if (body.mode === "AUTO" && !body.confirm) throw new HttpError(400, "Confirm enabling automatic sending");
      return setGlobalMode(user.id, body.mode);
    case "account_mode":
      return setAccountMode(user.id, body.accountId, body.mode);
    case "model_mode":
      return setModelMode(user.id, body.accountId, body.mode, body.confirm);
    case "rules":
      await db().automationSettings.update({ where: { id: "global" }, data: { rules: body.rules } });
      await audit("automation.rules", { actorId: user.id });
      return { ok: true };
    case "budget":
      await db().automationSettings.update({ where: { id: "global" }, data: { dailyAiBudgetMicros: body.dailyAiBudgetMicros } });
      await audit("automation.budget", { actorId: user.id, details: { micros: body.dailyAiBudgetMicros } });
      return { ok: true };
  }
});
