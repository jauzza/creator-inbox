import { db } from "./db";
import { DEFAULT_RULES } from "./automation/settings";
import { DEFAULT_STYLE } from "./ai/style";
import { EVAL_CASES } from "./evals/cases";
import { hashPassword } from "./auth/password";

const H = 3600_000;

/** Fictional, non-explicit demo data for the simulator. Safe to run repeatedly. */
export async function seedSimulator() {
  const existing = await db().creatorAccount.findFirst({ where: { isSimulated: true } });
  if (existing) return existing;
  const account = await db().creatorAccount.create({
    data: {
      displayName: "Mira (Demo)",
      provider: "SIMULATOR",
      externalAccountId: "sim_acct_mira",
      isSimulated: true,
      connectionStatus: "CONNECTED",
      timezone: "Europe/Amsterdam",
      lastSyncAt: new Date(),
      lastSyncOkAt: new Date(),
    },
  });
  await db().styleProfile.create({ data: { accountId: account.id, version: 1, active: true, data: DEFAULT_STYLE, changeNote: "Initial style pack (demo)" } });
  const items = await Promise.all(
    [
      { externalAssetId: "sim_asset_autumn", title: "Autumn Hike", description: "24 photos from a mountain trail trip in October", priceCents: 1200, priceConfirmed: true },
      { externalAssetId: "sim_asset_film2", title: "Film Diaries vol. 2", description: "30 film-camera photos from city walks", priceCents: 900, priceConfirmed: true },
      { externalAssetId: "sim_asset_kitchen", title: "Kitchen Sessions", description: "12 recipe photos with handwritten notes", priceCents: null, priceConfirmed: false },
    ].map((i) => db().catalogItem.create({ data: { ...i, accountId: account.id } })),
  );

  const fans: { ext: string; name: string; tags: string[]; msgs: [("in" | "out"), string, number][]; purchase?: number }[] = [
    { ext: "sim_fan_alex", name: "Alex R.", tags: ["regular"], msgs: [["in", "hey! loved the last set", -30], ["out", "thanks so much! glad you liked it 😊", -29.5], ["in", "when's the next one coming?", -0.2]] },
    { ext: "sim_fan_sam", name: "Sam K.", tags: [], msgs: [["in", "hi, is the subscription monthly?", -3]] },
    { ext: "sim_fan_jo", name: "Jo M.", tags: ["vip"], purchase: 0, msgs: [["in", "the autumn set was great", -50], ["out", "so happy you enjoyed it!", -49], ["in", "what's the price for the film diaries one?", -1]] },
    { ext: "sim_fan_lee", name: "Lee T.", tags: ["manual-only"], msgs: [["in", "hello again", -5]] },
    { ext: "sim_fan_kim", name: "Kim P.", tags: [], msgs: [["in", "do you do bundles?", -8], ["out", "not at the moment, but the Autumn Hike set is $12 if you're curious", -7.5], ["in", "no thanks, maybe later", -7]] },
    { ext: "sim_fan_ari", name: "Ari V.", tags: [], msgs: [["in", "I went hiking this weekend, any trail tips?", -0.5]] },
  ];
  for (const f of fans) {
    const customer = await db().customer.create({ data: { accountId: account.id, externalId: f.ext, displayName: f.name, tags: f.tags } });
    const conv = await db().conversation.create({ data: { accountId: account.id, customerId: customer.id, externalChatId: f.ext } });
    let lastIn: Date | null = null, lastOut: Date | null = null, firstUnanswered: Date | null = null;
    for (const [i, [dir, body, hours]] of f.msgs.entries()) {
      const at = new Date(Date.now() + hours * H);
      await db().message.create({
        data: { conversationId: conv.id, direction: dir === "in" ? "INBOUND" : "OUTBOUND", origin: dir === "in" ? "CUSTOMER" : "HUMAN", body, externalId: `seed_${f.ext}_${i}`, sentAt: at },
      });
      if (dir === "in") {
        lastIn = at;
        firstUnanswered = firstUnanswered ?? at;
      } else {
        lastOut = at;
        firstUnanswered = null;
      }
    }
    await db().conversation.update({ where: { id: conv.id }, data: { lastInboundAt: lastIn, lastOutboundAt: lastOut, firstUnansweredAt: firstUnanswered, unreadCount: firstUnanswered ? 1 : 0, version: f.msgs.length } });
    // Unanswered demo chats get a draft as soon as the worker runs (excluded/manual-only chats are skipped by policy).
    if (firstUnanswered) await db().job.create({ data: { type: "generate_reply", conversationId: conv.id, runAt: new Date(), dedupeKey: `gen:${conv.id}`, firstEventAt: new Date(), maxAttempts: 3 } });
    if (f.purchase != null) {
      const item = items[f.purchase];
      await db().purchase.create({
        data: { customerId: customer.id, catalogItemId: item.id, amountCents: item.priceCents ?? 0, feeCents: Math.round((item.priceCents ?? 0) * 0.2), verified: true, source: "simulator", externalTxnId: `seed_txn_${f.ext}`, occurredAt: new Date(Date.now() - 48 * H) },
      });
      await db().customer.update({ where: { id: customer.id }, data: { verifiedSpendCents: item.priceCents ?? 0, outcome: "PURCHASED" } });
    }
    if (f.ext === "sim_fan_kim") {
      await db().customer.update({ where: { id: customer.id }, data: { outcome: "DECLINED", declinedAt: new Date(Date.now() - 7 * H), suppressedUntil: new Date(Date.now() + 14 * 24 * H) } });
    }
  }
  return account;
}

export async function seedEvalCases() {
  for (const c of EVAL_CASES) {
    await db().evalCase.upsert({
      where: { key: c.key },
      create: { key: c.key, category: c.category, transcript: c.transcript, facts: c.facts ?? [], expected: c.expected },
      update: { category: c.category, transcript: c.transcript, facts: c.facts ?? [], expected: c.expected },
    });
  }
  return EVAL_CASES.length;
}

export async function seedBase(opts: { ownerEmail?: string; ownerPassword?: string } = {}) {
  await db().automationSettings.upsert({ where: { id: "global" }, create: { id: "global", globalMode: "DRAFT", rules: DEFAULT_RULES }, update: {} });
  await db().simulatorState.upsert({ where: { id: "sim" }, create: { id: "sim" }, update: {} });
  if (opts.ownerEmail && opts.ownerPassword && (await db().user.count()) === 0) {
    await db().user.create({ data: { email: opts.ownerEmail.toLowerCase(), name: "Owner", role: "OWNER", passwordHash: await hashPassword(opts.ownerPassword) } });
  }
}
