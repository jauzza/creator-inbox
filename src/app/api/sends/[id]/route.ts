import { z } from "zod";
import { api } from "@/server/http";
import { db } from "@/server/db";
import { assertConversationAccess } from "@/server/auth/access";
import { resolveUncertain } from "@/server/services/dispatch";

export const POST = api({ auth: "user", body: z.object({ action: z.enum(["retry", "mark_sent", "discard"]) }) }, async ({ user, params, body }) => {
  const s = await db().outboundSend.findUniqueOrThrow({ where: { id: params.id } });
  await assertConversationAccess(user, s.conversationId);
  await resolveUncertain(user.id, params.id, body.action);
  return { ok: true };
});
