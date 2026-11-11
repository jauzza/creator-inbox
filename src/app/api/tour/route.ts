import { z } from "zod";
import { api } from "@/server/http";
import { tourDraft, tourFollowup, tourReceive, TOUR_MESSAGE } from "@/server/services/tour";

export const GET = api({ auth: "user" }, async () => ({ message: TOUR_MESSAGE }));

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("receive") }),
  z.object({ action: z.literal("draft"), conversationId: z.string().min(1).max(60) }),
  z.object({ action: z.literal("followup"), conversationId: z.string().min(1).max(60), kind: z.enum(["chat", "ppv"]) }),
]);

export const POST = api({ auth: "user", body }, async ({ user, body }) => {
  if (body.action === "receive") return tourReceive(user.id);
  if (body.action === "followup") return tourFollowup(user.id, body.conversationId, body.kind);
  return tourDraft(user.id, body.conversationId);
});
