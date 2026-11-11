import { z } from "zod";
import { api } from "@/server/http";
import { db } from "@/server/db";
import { assertConversationAccess } from "@/server/auth/access";
import { audit } from "@/server/audit";

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("claim") }),
  z.object({ action: z.literal("release") }),
  z.object({ action: z.literal("resolve"), outcome: z.string().max(200), useful: z.boolean().nullable() }),
]);

export const POST = api({ auth: "user", body }, async ({ user, params, body }) => {
  const h = await db().handoff.findUniqueOrThrow({ where: { id: params.id } });
  await assertConversationAccess(user, h.conversationId);
  if (body.action === "claim") await db().handoff.update({ where: { id: h.id }, data: { status: "CLAIMED", ownerId: user.id, claimedAt: new Date() } });
  if (body.action === "release") await db().handoff.update({ where: { id: h.id }, data: { status: "OPEN", ownerId: null } });
  if (body.action === "resolve") await db().handoff.update({ where: { id: h.id }, data: { status: "RESOLVED", resolvedAt: new Date(), outcome: body.outcome, useful: body.useful, ownerId: h.ownerId ?? user.id } });
  await audit(`handoff.${body.action}`, { actorId: user.id, target: h.id });
  return { ok: true };
});
