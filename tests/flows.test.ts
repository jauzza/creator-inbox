import { describe, it, expect, beforeEach } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { freshDb, runQueue, setRules, simConversation, noTimingRestrictions } from "./helpers/db";
import { ingestInbound } from "@/server/services/ingest";
import { approveDraft, takeOver, resume, setEmergencyStop, setGlobalMode, setConversationMode } from "@/server/services/controls";
import { queueManualSend, resolveUncertain, performSend } from "@/server/services/dispatch";
import { simulateDuplicateWebhook, simulateBadSignature, setNextSendFailure, setAiFailNext, simulateScenario } from "@/server/services/simulator";
import { processWebhook } from "@/server/services/webhooks";
import { putSecret, getSecret, secretStatus } from "@/server/crypto/secrets";
import { accessibleAccountIds, assertConversationAccess } from "@/server/auth/access";
import { providerForAccount } from "@/server/providers/messaging/registry";
import { recoverStuckJobs } from "@/server/queue/jobs";
import { proposeOffer, approveOffer, markOfferSent, updateOfferPrice } from "@/server/services/offers";

let db: PrismaClient;
let ownerId: string;

async function inbound(convExt: string, text: string, id = `m_${Math.random().toString(36).slice(2)}`, at = new Date()) {
  const conv = await simConversation(db, convExt);
  return ingestInbound({ accountId: conv.accountId, chatId: convExt, message: { externalId: id, direction: "INBOUND", body: text, sentAt: at } });
}
const drafts = (conversationId: string) => db.draft.findMany({ where: { conversationId }, orderBy: { createdAt: "asc" } });
const outbound = (conversationId: string) => db.message.findMany({ where: { conversationId, direction: "OUTBOUND", origin: { not: "HUMAN" } } });

beforeEach(async () => {
  ({ client: db } = await freshDb());
  ownerId = (await db.user.create({ data: { email: "owner@example.test", name: "Owner", role: "OWNER", passwordHash: "x" } })).id;
  await setRules(db, noTimingRestrictions);
});

describe("draft mode (default)", () => {
  it("new installs start in Draft only", async () => {
    expect((await db.automationSettings.findUniqueOrThrow({ where: { id: "global" } })).globalMode).toBe("DRAFT");
  });

  it("inbound → debounced draft → human approval → simulator send", async () => {
    const r = await inbound("sim_fan_sam", "how do I cancel my subscription?");
    expect(r.duplicate).toBe(false);
    await runQueue(db);
    const [d] = await drafts(r.conversationId);
    expect(d.status).toBe("PROPOSED");
    expect(d.body).toMatch(/#ai/);
    expect(d.model).toBe("offline-rules-v1");
    expect(await outbound(r.conversationId)).toHaveLength(0); // draft mode never auto-sends
    await approveDraft(ownerId, d.id, { body: d.body.replace("it renews", "it renews") });
    await runQueue(db);
    expect((await db.draft.findUniqueOrThrow({ where: { id: d.id } })).status).toBe("SENT");
    expect(await db.simulatorSent.count()).toBe(1);
    const conv = await db.conversation.findUniqueOrThrow({ where: { id: r.conversationId } });
    expect(conv.firstUnansweredAt).toBeNull();
  });

  it("debounces a burst into ONE generation", async () => {
    await inbound("sim_fan_alex", "hey");
    await inbound("sim_fan_alex", "quick q");
    const r = await inbound("sim_fan_alex", "when do you post?");
    expect(await db.job.count({ where: { type: "generate_reply", status: "PENDING", conversationId: r.conversationId } })).toBe(1);
    await runQueue(db);
    expect((await drafts(r.conversationId)).filter((d) => d.status === "PROPOSED")).toHaveLength(1);
  });
});

describe("duplicates, ordering, signatures", () => {
  it("same provider message twice is stored once", async () => {
    const a = await inbound("sim_fan_sam", "hello", "dup_1");
    const b = await inbound("sim_fan_sam", "hello", "dup_1");
    expect(b.duplicate).toBe(true);
    expect(await db.message.count({ where: { conversationId: a.conversationId, externalId: "dup_1" } })).toBe(1);
  });

  it("duplicate webhook event is acknowledged but not re-processed", async () => {
    const r = await simulateDuplicateWebhook(ownerId, "sim_fan_sam");
    expect((r.first as any).results).toEqual(["ingested"]);
    expect((r.second as any).results).toEqual(["duplicate"]);
    expect((r.sameMessageNewEvent as any).results).toEqual(["duplicate_message"]);
  });

  it("rejects bad webhook signatures", async () => {
    expect((await simulateBadSignature()).status).toBe(401);
  });

  it("out-of-order older message still invalidates a pending draft and is ordered by provider time", async () => {
    const r = await inbound("sim_fan_sam", "is it monthly?", "n1", new Date());
    await runQueue(db);
    const [d] = await drafts(r.conversationId);
    expect(d.status).toBe("PROPOSED");
    await inbound("sim_fan_sam", "older message", "o1", new Date(Date.now() - 60_000));
    expect((await db.draft.findUniqueOrThrow({ where: { id: d.id } })).status).toBe("STALE");
    const msgs = await db.message.findMany({ where: { conversationId: r.conversationId }, orderBy: { sentAt: "asc" } });
    expect(msgs.findIndex((m) => m.externalId === "o1")).toBeLessThan(msgs.findIndex((m) => m.externalId === "n1"));
  });
});

describe("automatic mode and invalidation", () => {
  beforeEach(async () => {
    await setGlobalMode(ownerId, "AUTO");
  });

  it("auto-sends permitted replies after the scheduled delay", async () => {
    const r = await inbound("sim_fan_ari", "when do you post new sets?");
    await runQueue(db);
    const [d] = await drafts(r.conversationId);
    expect(d.status).toBe("SENT");
    expect((await outbound(r.conversationId))[0].origin).toBe("AI_AUTO");
  });

  it("new inbound message invalidates queued work", async () => {
    const r = await inbound("sim_fan_ari", "when do you post?");
    await db.job.updateMany({ where: { type: "generate_reply" }, data: { runAt: new Date(0) } });
    const { drain } = await import("@/server/queue/worker");
    await drain(); // generate only; dispatch is scheduled in the future
    const [d] = await drafts(r.conversationId);
    expect(d.status).toBe("QUEUED");
    await inbound("sim_fan_ari", "also what camera do you use?");
    expect((await db.draft.findUniqueOrThrow({ where: { id: d.id } })).status).toBe("STALE");
    expect(await db.job.count({ where: { type: "dispatch_draft", status: "PENDING" } })).toBe(0);
  });

  it("takeover cancels queued AI sends; resume requires an explicit action", async () => {
    const r = await inbound("sim_fan_ari", "when do you post?");
    await db.job.updateMany({ where: { type: "generate_reply" }, data: { runAt: new Date(0) } });
    const { drain } = await import("@/server/queue/worker");
    await drain();
    const [d] = await drafts(r.conversationId);
    await takeOver(ownerId, r.conversationId);
    await runQueue(db);
    expect((await db.draft.findUniqueOrThrow({ where: { id: d.id } })).status).toBe("CANCELLED");
    expect(await db.simulatorSent.count()).toBe(0);
    await inbound("sim_fan_ari", "hello?");
    await runQueue(db);
    expect(await db.simulatorSent.count()).toBe(0); // still manual
    await resume(ownerId, r.conversationId);
    await runQueue(db);
    expect(await db.simulatorSent.count()).toBe(1);
  });

  it("takeover racing a dispatch: the version check stops the stale send", async () => {
    const r = await inbound("sim_fan_ari", "when do you post?");
    await db.job.updateMany({ where: { type: "generate_reply" }, data: { runAt: new Date(0) } });
    const { drain } = await import("@/server/queue/worker");
    await drain();
    const [d] = await drafts(r.conversationId);
    // Simulate the race: takeover commits while the dispatch job is already claimed (job not cancelled).
    await db.conversation.update({ where: { id: r.conversationId }, data: { takenOverById: ownerId, version: { increment: 1 } } });
    const { dispatchDraft } = await import("@/server/services/dispatch");
    const out = await dispatchDraft(d.id);
    expect(out.outcome).toMatch(/reverted|stale/);
    expect(await db.simulatorSent.count()).toBe(0);
  });

  it("global emergency stop prevents all new send attempts", async () => {
    const r = await inbound("sim_fan_ari", "when do you post?");
    await db.job.updateMany({ where: { type: "generate_reply" }, data: { runAt: new Date(0) } });
    const { drain } = await import("@/server/queue/worker");
    await drain();
    await setEmergencyStop(ownerId, true);
    await runQueue(db);
    expect(await db.simulatorSent.count()).toBe(0);
    expect((await drafts(r.conversationId))[0].status).toBe("PROPOSED");
    await expect(queueManualSend(ownerId, r.conversationId, "hi")).rejects.toThrow(/Emergency stop/);
    await expect(approveDraft(ownerId, (await drafts(r.conversationId))[0].id, {})).rejects.toThrow(/Emergency stop/);
  });

  it("stale drafts older than the max age are re-evaluated, not sent", async () => {
    await setRules(db, { maxDraftAgeMin: 1 });
    const r = await inbound("sim_fan_ari", "when do you post?");
    await db.job.updateMany({ where: { type: "generate_reply" }, data: { runAt: new Date(0) } });
    const { drain } = await import("@/server/queue/worker");
    await drain();
    const [d] = await drafts(r.conversationId);
    await db.draft.update({ where: { id: d.id }, data: { createdAt: new Date(Date.now() - 5 * 60_000) } });
    await db.job.updateMany({ where: { type: "dispatch_draft" }, data: { runAt: new Date(0) } });
    await drain(1);
    expect((await db.draft.findUniqueOrThrow({ where: { id: d.id } })).status).toBe("STALE");
    expect(await db.job.count({ where: { type: "generate_reply", status: "PENDING" } })).toBe(1);
  });

  it("per-conversation mode override to Draft holds queued replies", async () => {
    const r = await inbound("sim_fan_ari", "when do you post?");
    await db.job.updateMany({ where: { type: "generate_reply" }, data: { runAt: new Date(0) } });
    const { drain } = await import("@/server/queue/worker");
    await drain();
    await setConversationMode(ownerId, r.conversationId, "DRAFT");
    await runQueue(db);
    expect((await drafts(r.conversationId))[0].status).toBe("PROPOSED");
    expect(await db.simulatorSent.count()).toBe(0);
  });

  it("excluded customers (tag manual-only) are never auto-drafted", async () => {
    const r = await inbound("sim_fan_lee", "when do you post?");
    await runQueue(db);
    expect(await drafts(r.conversationId)).toHaveLength(0);
  });
});

describe("ambiguous sends, rate limits and restarts", () => {
  async function approvedDraft(text = "is it monthly?") {
    const r = await inbound("sim_fan_sam", text);
    await runQueue(db);
    const [d] = await drafts(r.conversationId);
    return { r, d };
  }

  it("timeout after delivery → UNCERTAIN → reconciled as sent (no duplicate)", async () => {
    const { r, d } = await approvedDraft();
    await setNextSendFailure(ownerId, "timeout_delivered");
    await approveDraft(ownerId, d.id, {});
    await runQueue(db, 8);
    expect((await db.draft.findUniqueOrThrow({ where: { id: d.id } })).status).toBe("SENT");
    expect(await db.simulatorSent.count()).toBe(1);
    expect(await outbound(r.conversationId)).toHaveLength(1);
  });

  it("timeout with loss → stays in review, never auto-resent; retry reuses the idempotency key", async () => {
    const { r, d } = await approvedDraft();
    await setNextSendFailure(ownerId, "timeout_lost");
    await approveDraft(ownerId, d.id, {});
    await runQueue(db, 8);
    const send = await db.outboundSend.findFirstOrThrow({ where: { draftId: d.id } });
    expect(send.status).toBe("UNCERTAIN");
    expect(await db.simulatorSent.count()).toBe(0);
    expect(await db.handoff.count({ where: { conversationId: r.conversationId, category: "uncertain_send" } })).toBe(1);
    await resolveUncertain(ownerId, send.id, "retry");
    await runQueue(db);
    const after = await db.outboundSend.findUniqueOrThrow({ where: { id: send.id } });
    expect(after.status).toBe("ACCEPTED");
    expect((await db.simulatorSent.findFirstOrThrow()).idempotencyKey).toBe(send.idempotencyKey);
  });

  it("provider rate limit defers and retries without duplicating", async () => {
    const { d } = await approvedDraft();
    await setNextSendFailure(ownerId, "rate_limited");
    await approveDraft(ownerId, d.id, {});
    await db.creatorAccount.updateMany({ data: { nextSendAllowedAt: null } });
    await runQueue(db, 3);
    await db.creatorAccount.updateMany({ data: { nextSendAllowedAt: null } });
    await runQueue(db, 3);
    expect((await db.draft.findUniqueOrThrow({ where: { id: d.id } })).status).toBe("SENT");
    expect(await db.simulatorSent.count()).toBe(1);
  });

  it("rejected sends fail visibly", async () => {
    const { d } = await approvedDraft();
    await setNextSendFailure(ownerId, "rejected");
    await approveDraft(ownerId, d.id, {});
    await runQueue(db);
    expect((await db.draft.findUniqueOrThrow({ where: { id: d.id } })).status).toBe("FAILED");
    expect(await db.notification.count({ where: { kind: "send_failed" } })).toBe(1);
  });

  it("worker crash with a send in flight → recovered as UNCERTAIN, not resent", async () => {
    const { d } = await approvedDraft();
    const conv = await simConversation(db, "sim_fan_sam");
    const send = await db.outboundSend.create({ data: { draftId: d.id, conversationId: conv.id, idempotencyKey: "crash_1", body: "x", origin: "AI_APPROVED", status: "IN_FLIGHT", isSimulated: true } });
    await db.job.create({ data: { type: "dispatch_manual", status: "RUNNING", runAt: new Date(0), lockedAt: new Date(Date.now() - 10 * 60_000), conversationId: conv.id, payload: { sendId: send.id } } });
    expect(await recoverStuckJobs()).toBe(1);
    const out = await performSend(send.id);
    expect(out.outcome).toMatch(/uncertain/);
    expect(await db.simulatorSent.count()).toBe(0);
  });
});

describe("AI failures, budget, scope", () => {
  it("malformed AI output twice → visible failed draft + handoff, nothing sent", async () => {
    await setGlobalMode(ownerId, "AUTO");
    await setAiFailNext(ownerId, 2);
    const r = await inbound("sim_fan_ari", "when do you post?");
    await runQueue(db);
    const [d] = await drafts(r.conversationId);
    expect(d.status).toBe("HANDOFF");
    expect(d.explanation).toMatch(/AI failed/);
    expect(await db.handoff.count({ where: { conversationId: r.conversationId, category: "ai_failure" } })).toBe(1);
    expect(await db.simulatorSent.count()).toBe(0);
  });

  it("budget cap reached → no generation, handoff + notification", async () => {
    await db.automationSettings.update({ where: { id: "global" }, data: { dailyAiBudgetMicros: 0 } });
    const r = await inbound("sim_fan_sam", "is it monthly?");
    await runQueue(db);
    expect(await drafts(r.conversationId)).toHaveLength(0);
    expect(await db.handoff.count({ where: { category: "budget" } })).toBe(1);
  });

  it("explicit requests and billing disputes go straight to a human and pause the chat", async () => {
    const r = await inbound("sim_fan_sam", "send me something nsfw");
    await runQueue(db);
    expect(await drafts(r.conversationId)).toHaveLength(0);
    const conv = await db.conversation.findUniqueOrThrow({ where: { id: r.conversationId } });
    expect(conv.modeOverride).toBe("PAUSED");
    expect((await db.handoff.findFirstOrThrow({ where: { conversationId: r.conversationId } })).category).toBe("explicit_request");
  });

  it("prompt injection is treated as data and cannot change settings or leak secrets", async () => {
    await putSecret("ai.primary", "sk-secret-value-123456");
    await setGlobalMode(ownerId, "AUTO");
    const r = await simulateScenario(ownerId, "injection", "sim_fan_ari");
    await runQueue(db);
    const ds = await drafts(r.conversationId!);
    for (const d of ds) expect(d.body).not.toMatch(/sk-secret|system prompt|free bundle/i);
    expect((await db.automationSettings.findUniqueOrThrow({ where: { id: "global" } })).globalMode).toBe("AUTO");
    expect(await db.offer.count()).toBe(0);
    expect(await db.purchase.count({ where: { source: { not: "simulator" } } })).toBe(0);
  });

  it("opt-out sets do-not-contact and blocks manual sends", async () => {
    const r = await inbound("sim_fan_sam", "please stop messaging me");
    const c = await db.conversation.findUniqueOrThrow({ where: { id: r.conversationId }, include: { customer: true } });
    expect(c.customer.doNotContact).toBe(true);
    await expect(queueManualSend(ownerId, r.conversationId, "ok")).rejects.toThrow(/not to be contacted/);
  });

  it("high-interest message creates a prioritized handoff with evidence", async () => {
    const r = await simulateScenario(ownerId, "high_interest", "sim_fan_sam");
    const h = await db.handoff.findFirstOrThrow({ where: { conversationId: r.conversationId! } });
    expect(h.category).toBe("purchase_interest");
    const signals = await db.intentSignal.findMany({ where: { customer: { externalId: "sim_fan_sam" } } });
    expect(signals.length).toBeGreaterThan(0);
  });
});

describe("isolation, secrets, simulator boundary, offers", () => {
  it("operators only see accounts granted to them", async () => {
    const op = await db.user.create({ data: { email: "op@example.test", name: "Op", role: "OPERATOR", passwordHash: "x" } });
    const conv = await simConversation(db);
    expect(await accessibleAccountIds(op)).toEqual([]);
    await expect(assertConversationAccess(op, conv.id)).rejects.toThrow(/Not found/);
    await db.accountAccess.create({ data: { userId: op.id, accountId: conv.accountId } });
    await expect(assertConversationAccess(op, conv.id)).resolves.toBeTruthy();
  });

  it("secrets are encrypted at rest and status never exposes the value", async () => {
    await putSecret("messaging.onlyfansapi_com", "ofapi_live_key_abcdef123");
    const row = await db.secret.findUniqueOrThrow({ where: { id: "messaging.onlyfansapi_com" } });
    expect(JSON.stringify(row)).not.toContain("ofapi_live_key");
    expect(await getSecret("messaging.onlyfansapi_com")).toBe("ofapi_live_key_abcdef123");
    expect(JSON.stringify(await secretStatus("messaging.onlyfansapi_com"))).not.toContain("ofapi");
  });

  it("a simulated account can never resolve to a live provider", async () => {
    await putSecret("messaging.onlyfansapi_com", "ofapi_key");
    const p = await providerForAccount({ provider: "ONLYFANSAPI_COM", isSimulated: true });
    expect(p.isSimulated).toBe(true);
  });

  it("live webhooks are rejected when unsigned or not configured", async () => {
    const r = await processWebhook("onlyfansapi_com", "{}", new Headers());
    expect([401, 503]).toContain(r.status);
  });

  it("offers: no repeat of purchased items, approval freezes recipient/asset/price", async () => {
    const jo = await db.customer.findFirstOrThrow({ where: { externalId: "sim_fan_jo" } });
    const autumn = await db.catalogItem.findFirstOrThrow({ where: { title: "Autumn Hike" } });
    const film = await db.catalogItem.findFirstOrThrow({ where: { title: "Film Diaries vol. 2" } });
    await expect(proposeOffer(ownerId, { customerId: jo.id, catalogItemId: autumn.id, priceCents: 1200 })).rejects.toThrow(/already bought/);
    const o = await proposeOffer(ownerId, { customerId: jo.id, catalogItemId: film.id, priceCents: 900 });
    await expect(approveOffer(ownerId, o.id, { customerId: jo.id, externalAssetId: film.externalAssetId, priceCents: 1900 })).rejects.toThrow(/does not match/);
    await approveOffer(ownerId, o.id, { customerId: jo.id, externalAssetId: film.externalAssetId, priceCents: 900 });
    await updateOfferPrice(ownerId, o.id, 1000);
    await expect(markOfferSent(ownerId, o.id)).rejects.toThrow(/approved first/);
    const kim = await db.customer.findFirstOrThrow({ where: { externalId: "sim_fan_kim" } });
    await expect(proposeOffer(ownerId, { customerId: kim.id, catalogItemId: film.id, priceCents: 900 })).rejects.toThrow(/suppressed/);
  });
});

describe("guided tour (simulated test customer)", () => {
  it("delivers the test message, drafts on request, and never touches a real provider", async () => {
    const { tourReceive, tourDraft, TOUR_MESSAGE } = await import("@/server/services/tour");
    const { conversationId } = await tourReceive(ownerId);
    const conv = await db.conversation.findUniqueOrThrow({ where: { id: conversationId }, include: { account: true, messages: true } });
    expect(conv.account.isSimulated).toBe(true);
    expect(conv.messages.map((m) => m.body)).toEqual([TOUR_MESSAGE]);
    // The tour drafts explicitly, so no debounced job is left behind.
    expect(await db.job.count({ where: { conversationId, status: "PENDING", type: "generate_reply" } })).toBe(0);

    const r = await tourDraft(ownerId, conversationId);
    const d = await db.draft.findUniqueOrThrow({ where: { id: r.draftId! } });
    expect(d.status).toBe("PROPOSED"); // Draft-only default: nothing is queued to send
    expect(d.body).toMatch(/Tuesdays and Fridays/);
    expect(d.body).toMatch(/#ai/);
    expect(await db.simulatorSent.count()).toBe(0);

    // Restarting the tour replaces the test conversation instead of piling up copies.
    const again = await tourReceive(ownerId);
    expect(again.conversationId).not.toBe(conversationId);
    expect(await db.conversation.count({ where: { externalChatId: "sim_tour_guest" } })).toBe(1);
  });

  it("refuses to draft for a conversation that isn't the tour's", async () => {
    const { tourDraft } = await import("@/server/services/tour");
    const r = await inbound("sim_fan_sam", "hello");
    await expect(tourDraft(ownerId, r.conversationId)).rejects.toThrow(/tour/);
  });
});
