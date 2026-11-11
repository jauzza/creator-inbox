import { z } from "zod";
import { api } from "@/server/http";
import { db } from "@/server/db";
import { assertConversationAccess, HttpError } from "@/server/auth/access";
import { conversationDetail } from "@/server/services/queries";
import { takeOver, resume, setConversationMode, regenerate } from "@/server/services/controls";
import { queueManualSend } from "@/server/services/dispatch";
import { audit } from "@/server/audit";

export const GET = api({ auth: "user" }, async ({ user, params }) => {
  await assertConversationAccess(user, params.id);
  return conversationDetail(params.id);
});

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("takeover") }),
  z.object({ action: z.literal("resume") }),
  z.object({ action: z.literal("mode"), mode: z.enum(["AUTO", "DRAFT", "MANUAL", "PAUSED"]).nullable() }),
  z.object({ action: z.literal("regenerate") }),
  z.object({ action: z.literal("send"), body: z.string().trim().min(1).max(2000) }),
  z.object({ action: z.literal("note"), body: z.string().trim().min(1).max(2000) }),
  z.object({ action: z.literal("tags"), tags: z.array(z.string().trim().min(1).max(40)).max(20) }),
  z.object({ action: z.literal("read") }),
  z.object({ action: z.literal("summary"), summary: z.string().max(1000).nullable() }),
]);

export const POST = api({ auth: "user", body }, async ({ user, params, body }) => {
  await assertConversationAccess(user, params.id);
  switch (body.action) {
    case "takeover":
      return takeOver(user.id, params.id);
    case "resume":
      return resume(user.id, params.id);
    case "mode":
      return setConversationMode(user.id, params.id, body.mode);
    case "regenerate":
      return regenerate(user.id, params.id);
    case "send": {
      const s = await queueManualSend(user.id, params.id, body.body);
      return { sendId: s.id };
    }
    case "note":
      await db().note.create({ data: { conversationId: params.id, userId: user.id, body: body.body } });
      return { ok: true };
    case "tags":
      await db().conversation.update({ where: { id: params.id }, data: { tags: [...new Set(body.tags)] } });
      await audit("conversation.tags", { actorId: user.id, target: params.id, details: { tags: body.tags } });
      return { ok: true };
    case "read":
      await db().conversation.update({ where: { id: params.id }, data: { unreadCount: 0 } });
      return { ok: true };
    case "summary":
      // Bounded, operator-editable summary used as model context (provenance: operator).
      await db().conversation.update({ where: { id: params.id }, data: { summary: body.summary, summaryUpdatedAt: new Date() } });
      await audit("conversation.summary", { actorId: user.id, target: params.id });
      return { ok: true };
  }
  throw new HttpError(400, "Unknown action");
});
