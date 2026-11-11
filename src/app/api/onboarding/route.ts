import { z } from "zod";
import { api } from "@/server/http";
import { completeOnboarding, finishTour, onboardingStatus } from "@/server/services/onboarding";

export const GET = api({ auth: "user" }, async ({ user }) => onboardingStatus(user.id));

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("complete"), acceptSampleReplies: z.boolean().optional() }),
  z.object({ action: z.literal("tour_done") }),
]);

export const POST = api({ auth: "user", body }, async ({ user, body }) => {
  if (body.action === "tour_done") await finishTour(user.id);
  else await completeOnboarding(user, body.acceptSampleReplies);
  return { ok: true };
});
