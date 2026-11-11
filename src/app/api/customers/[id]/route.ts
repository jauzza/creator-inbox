import { z } from "zod";
import { api } from "@/server/http";
import { db } from "@/server/db";
import { assertAccountAccess } from "@/server/auth/access";
import { audit } from "@/server/audit";

const body = z.object({
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  assignedUserId: z.string().nullable().optional(),
  outcome: z.enum(["NONE", "CONTACTED", "INTERESTED", "PURCHASED", "DECLINED", "NO_RESPONSE"]).optional(),
  doNotContact: z.boolean().optional(),
  clearSuppression: z.boolean().optional(),
  addPreference: z.string().trim().min(1).max(200).optional(),
  removePreferenceIndex: z.number().int().min(0).optional(),
  resetIntent: z.boolean().optional(),
});

export const POST = api({ auth: "user", body }, async ({ user, params, body }) => {
  const c = await db().customer.findUniqueOrThrow({ where: { id: params.id } });
  await assertAccountAccess(user, c.accountId);
  let prefs = Array.isArray(c.preferences) ? [...(c.preferences as any[])] : [];
  if (body.addPreference) prefs.push({ value: body.addPreference, source: "operator", by: user.id, at: new Date().toISOString() });
  if (body.removePreferenceIndex != null) prefs = prefs.filter((_, i) => i !== body.removePreferenceIndex);
  await db().customer.update({
    where: { id: c.id },
    data: {
      ...(body.tags ? { tags: [...new Set(body.tags)] } : {}),
      ...(body.assignedUserId !== undefined ? { assignedUserId: body.assignedUserId } : {}),
      ...(body.outcome ? { outcome: body.outcome, ...(body.outcome === "DECLINED" ? { declinedAt: new Date() } : {}) } : {}),
      ...(body.doNotContact !== undefined ? { doNotContact: body.doNotContact } : {}),
      ...(body.clearSuppression ? { suppressedUntil: null } : {}),
      ...(body.resetIntent ? { intentScore: 0, intentUpdatedAt: new Date() } : {}),
      preferences: prefs,
    },
  });
  if (body.resetIntent) await db().intentSignal.deleteMany({ where: { customerId: c.id } });
  await audit("customer.update", { actorId: user.id, target: c.id, details: { fields: Object.keys(body) } });
  return { ok: true };
});
