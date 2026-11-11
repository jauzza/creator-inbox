import { z } from "zod";
import { api } from "@/server/http";
import { db } from "@/server/db";
import { SIM_SCENARIOS, simulateScenario, simulateCustomText, simulateDuplicateWebhook, simulateOutOfOrder, simulateBadSignature, setNextSendFailure, setAiFailNext, fastForward, simulatePurchase } from "@/server/services/simulator";
import { seedSimulator } from "@/server/seed";
import { requireOwner } from "@/server/auth/access";
import { audit } from "@/server/audit";

export const GET = api({ auth: "user" }, async () => {
  const state = await db().simulatorState.upsert({ where: { id: "sim" }, create: { id: "sim" }, update: {} });
  const acct = await db().creatorAccount.findFirst({ where: { isSimulated: true }, orderBy: { createdAt: "asc" } });
  const chats = await db().conversation.findMany({ where: { account: { isSimulated: true } }, include: { customer: { select: { displayName: true } }, account: { select: { displayName: true } } }, orderBy: { createdAt: "asc" } });
  const sent = await db().simulatorSent.findMany({ orderBy: { createdAt: "desc" }, take: 10 });
  return { scenarios: Object.keys(SIM_SCENARIOS), state, account: acct ? { id: acct.id, name: acct.displayName } : null, chats: chats.map((c) => ({ id: c.id, chatId: c.externalChatId, name: `${c.customer.displayName} · ${c.account.displayName.replace(" (Demo)", "")}` })), sent };
});

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("scenario"), scenario: z.enum(Object.keys(SIM_SCENARIOS) as [keyof typeof SIM_SCENARIOS]), chatId: z.string().max(60).optional() }),
  z.object({ action: z.literal("message"), chatId: z.string().max(60), text: z.string().min(1).max(1000) }),
  z.object({ action: z.literal("duplicate"), chatId: z.string().max(60) }),
  z.object({ action: z.literal("out_of_order"), chatId: z.string().max(60) }),
  z.object({ action: z.literal("bad_signature") }),
  z.object({ action: z.literal("send_failure"), failure: z.enum(["timeout_delivered", "timeout_lost", "rejected", "rate_limited"]).nullable() }),
  z.object({ action: z.literal("ai_fail"), n: z.number().int().min(0).max(5) }),
  z.object({ action: z.literal("fast_forward") }),
  z.object({ action: z.literal("purchase"), customerId: z.string(), catalogItemId: z.string() }),
  z.object({ action: z.literal("reset") }),
]);

export const POST = api({ auth: "user", body }, async ({ user, body }) => {
  switch (body.action) {
    case "scenario":
      return simulateScenario(user.id, body.scenario, body.chatId);
    case "message":
      return simulateCustomText(user.id, body.chatId, body.text);
    case "duplicate":
      return simulateDuplicateWebhook(user.id, body.chatId);
    case "out_of_order":
      return simulateOutOfOrder(user.id, body.chatId);
    case "bad_signature":
      return simulateBadSignature();
    case "send_failure":
      await setNextSendFailure(user.id, body.failure);
      return { ok: true };
    case "ai_fail":
      await setAiFailNext(user.id, body.n);
      return { ok: true };
    case "fast_forward":
      return fastForward(user.id);
    case "purchase":
      await simulatePurchase(user.id, body.customerId, body.catalogItemId);
      return { ok: true };
    case "reset": {
      requireOwner(user);
      await db().creatorAccount.deleteMany({ where: { isSimulated: true } });
      await db().simulatorSent.deleteMany({});
      await db().webhookEvent.deleteMany({ where: { provider: "simulator" } });
      await seedSimulator();
      await audit("simulator.reset", { actorId: user.id });
      return { ok: true };
    }
  }
});
