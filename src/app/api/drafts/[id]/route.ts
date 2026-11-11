import { z } from "zod";
import { api } from "@/server/http";
import { db } from "@/server/db";
import { assertConversationAccess } from "@/server/auth/access";
import { approveDraft, rejectDraft, cancelQueued, DRAFT_LABELS } from "@/server/services/controls";

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve"), body: z.string().max(2000).optional(), labels: z.array(z.enum(DRAFT_LABELS)).max(9).optional(), force: z.boolean().optional() }),
  z.object({ action: z.literal("reject"), reason: z.string().max(300).optional(), labels: z.array(z.enum(DRAFT_LABELS)).max(9).optional() }),
  z.object({ action: z.literal("cancel") }),
  z.object({ action: z.literal("label"), labels: z.array(z.enum(DRAFT_LABELS)).max(9) }),
]);

export const POST = api({ auth: "user", body }, async ({ user, params, body }) => {
  const d = await db().draft.findUniqueOrThrow({ where: { id: params.id }, select: { conversationId: true } });
  await assertConversationAccess(user, d.conversationId);
  if (body.action === "approve") return approveDraft(user.id, params.id, body);
  if (body.action === "reject") return rejectDraft(user.id, params.id, body);
  if (body.action === "label") return db().draft.update({ where: { id: params.id }, data: { labels: body.labels } }).then(() => ({ ok: true }));
  return cancelQueued(user.id, params.id);
});
