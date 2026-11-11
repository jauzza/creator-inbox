import { db } from "../db";
import { seedSimulator } from "../seed";
import { cancelJobs, lockConversation } from "../queue/jobs";
import { HttpError } from "../auth/access";
import { audit } from "../audit";
import { deliverSimulated } from "./simulator";
import { generateReply } from "./drafting";

/**
 * Guided-tour helpers. Everything happens on the SIMULATED account: the simulator provider has no
 * network code, so nothing in the tour can reach a real customer or a real messaging endpoint.
 */
export const TOUR_CHAT_ID = "sim_tour_guest";
export const TOUR_CUSTOMER = "Taylor (test customer)";
export const TOUR_MESSAGE = "Hey! I'm new here. What kind of content do you offer?";

async function tourConversation(accountId: string) {
  return db().conversation.findUnique({ where: { accountId_externalChatId: { accountId, externalChatId: TOUR_CHAT_ID } } });
}

/** Start fresh: remove the previous test conversation, then deliver the test customer's message. */
export async function tourReceive(userId: string) {
  const acct = (await db().creatorAccount.findFirst({ where: { isSimulated: true } })) ?? (await seedSimulator());
  const old = await tourConversation(acct.id);
  if (old) await db().customer.delete({ where: { id: old.customerId } });
  await deliverSimulated(TOUR_CHAT_ID, TOUR_CUSTOMER, TOUR_MESSAGE);
  const conv = await tourConversation(acct.id);
  if (!conv) throw new HttpError(500, "The test message could not be delivered");
  // The tour asks for the draft explicitly (next step), so the usual debounced job is not needed.
  await db().$transaction((tx) => cancelJobs(tx, { conversationId: conv.id, types: ["generate_reply"] }, "Guided tour drafts on request"));
  await audit("tour.test_message", { actorId: userId, target: conv.id });
  return { conversationId: conv.id };
}

/** Draft a reply now, through the normal pipeline (policy → AI → validator → draft). */
export async function tourDraft(userId: string, conversationId: string) {
  const conv = await db().conversation.findUnique({ where: { id: conversationId }, include: { account: true } });
  if (!conv || !conv.account.isSimulated || conv.externalChatId !== TOUR_CHAT_ID) throw new HttpError(400, "That isn't the tour's test conversation");
  await db().$transaction(async (tx) => {
    await lockConversation(tx, conversationId);
    await cancelJobs(tx, { conversationId, types: ["generate_reply"] }, "Guided tour drafts on request");
    await tx.draft.updateMany({ where: { conversationId, status: { in: ["PROPOSED", "HANDOFF"] } }, data: { status: "CANCELLED", rejectedReason: "Replaced by a new tour draft" } });
  });
  const r = await generateReply(conversationId);
  await audit("tour.draft", { actorId: userId, target: conversationId, details: { outcome: r.outcome } });
  const draft = await db().draft.findFirst({ where: { conversationId }, orderBy: { createdAt: "desc" } });
  return { outcome: r.outcome, draftId: draft?.id ?? null };
}
