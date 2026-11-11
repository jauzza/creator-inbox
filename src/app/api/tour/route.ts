import { z } from "zod";
import { api } from "@/server/http";
import { tourDraft, tourReceive, TOUR_MESSAGE } from "@/server/services/tour";

export const GET = api({ auth: "user" }, async () => ({ message: TOUR_MESSAGE }));

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("receive") }),
  z.object({ action: z.literal("draft"), conversationId: z.string().min(1).max(60) }),
]);

export const POST = api({ auth: "user", body }, async ({ user, body }) => {
  if (body.action === "receive") return tourReceive(user.id);
  return tourDraft(user.id, body.conversationId);
});
