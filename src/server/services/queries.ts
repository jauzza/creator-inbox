import { db } from "../db";
import { getAutomation } from "../automation/settings";
import { policyFor } from "./shared";
import { decay } from "../scoring/intent";
import { todayKey } from "../ai/config";
import { providerForAccount } from "../providers/messaging/registry";
import type { SessionUser } from "../auth/session";
import { accessibleAccountIds } from "../auth/access";
import { modelMode } from "./controls";

export async function overview(user: SessionUser) {
  const ids = await accessibleAccountIds(user);
  const conv = { accountId: { in: ids } };
  const auto = await getAutomation();
  const since7 = todayKey(new Date(Date.now() - 6 * 86400000));
  const since30 = new Date(Date.now() - 30 * 86400000);
  const [accounts, unread, handoffs, queued, proposed, uncertain, costToday, cost7, hb, realSales, simSales] = await Promise.all([
    db().creatorAccount.findMany({ where: { id: { in: ids } }, orderBy: { createdAt: "asc" } }),
    db().conversation.count({ where: { ...conv, unreadCount: { gt: 0 } } }),
    db().handoff.count({ where: { status: { in: ["OPEN", "CLAIMED"] }, conversation: conv } }),
    db().draft.count({ where: { status: "QUEUED", conversation: conv } }),
    db().draft.count({ where: { status: "PROPOSED", conversation: conv, nextAction: { not: "WAIT" } } }),
    db().outboundSend.count({ where: { status: "UNCERTAIN", conversationId: { in: (await db().conversation.findMany({ where: conv, select: { id: true } })).map((c) => c.id) } } }),
    db().aiUsage.aggregate({ where: { day: todayKey() }, _sum: { costMicros: true, tokensIn: true, tokensOut: true }, _count: true }),
    db().aiUsage.aggregate({ where: { day: { gte: since7 } }, _sum: { costMicros: true } }),
    db().integrationConfig.findUnique({ where: { id: "worker_heartbeat" } }),
    db().purchase.aggregate({ where: { verified: true, source: { not: "simulator" }, occurredAt: { gte: since30 }, customer: { accountId: { in: ids } } }, _sum: { amountCents: true, refundedCents: true, feeCents: true }, _count: true }),
    db().purchase.aggregate({ where: { source: "simulator", occurredAt: { gte: since30 }, customer: { accountId: { in: ids } } }, _sum: { amountCents: true }, _count: true }),
  ]);
  const hbAt = (hb?.settings as any)?.at ? new Date((hb!.settings as any).at) : null;

  // Home screen: plain-language status, who needs a person, and what the AI is helping with.
  const aiRow = await db().integrationConfig.findUnique({ where: { id: "ai" } });
  const aiSettings = { provider: "offline", replyModel: "", verifiedModel: null as string | null, ...((aiRow?.settings as object) ?? {}) } as { provider: string; replyModel: string; verifiedModel: string | null };
  const convs = await db().conversation.findMany({
    where: conv,
    include: {
      account: true,
      customer: true,
      messages: { orderBy: { sentAt: "desc" }, take: 1 },
      drafts: { where: { status: { in: ["PROPOSED", "HANDOFF", "UNCERTAIN", "QUEUED"] } }, orderBy: { createdAt: "desc" }, take: 1 },
      handoffs: { where: { status: { in: ["OPEN", "CLAIMED"] } }, orderBy: { priority: "desc" }, take: 1 },
    },
    orderBy: [{ lastInboundAt: { sort: "desc", nulls: "last" } }],
    take: 500,
  });
  let aiHelping = 0;
  const perModel = new Map<string, { needsYou: number; drafts: number; queued: number; chats: number; unread: number }>();
  for (const a of accounts) perModel.set(a.id, { needsYou: 0, drafts: 0, queued: 0, chats: 0, unread: 0 });
  const attention: { conversationId: string; customer: string; model: string; isSimulated: boolean; kind: "handoff" | "draft" | "uncertain"; reason: string; preview: string | null; at: Date | null; priority: number }[] = [];
  for (const c of convs) {
    const pol = policyFor(c, auto);
    if (pol.aiMayDraft) aiHelping++;
    const pm = perModel.get(c.accountId);
    if (pm) {
      pm.chats++;
      if (c.unreadCount > 0) pm.unread++;
      if (c.handoffs[0] || c.drafts[0]?.status === "UNCERTAIN") pm.needsYou++;
      else if (c.drafts[0]?.status === "PROPOSED" && c.drafts[0].nextAction !== "WAIT") pm.drafts++;
      if (c.drafts[0]?.status === "QUEUED") pm.queued++;
    }
    const h = c.handoffs[0];
    const d = c.drafts[0];
    const base = { conversationId: c.id, customer: c.customer.displayName, model: c.account.displayName, isSimulated: c.account.isSimulated, preview: c.messages[0]?.body.slice(0, 140) ?? null, at: c.lastInboundAt };
    if (h) attention.push({ ...base, kind: "handoff", reason: h.reason, priority: 100 + h.priority });
    else if (d?.status === "UNCERTAIN") attention.push({ ...base, kind: "uncertain", reason: "We couldn't confirm a reply was delivered", priority: 90 });
    else if (d?.status === "PROPOSED" && d.nextAction !== "WAIT") attention.push({ ...base, kind: "draft", reason: "A reply is ready for your approval", priority: 50 });
  }
  attention.sort((a, b) => b.priority - a.priority || (b.at?.getTime() ?? 0) - (a.at?.getTime() ?? 0));
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const [inToday, outToday, inTodaySim, outTodaySim] = await Promise.all([
    db().message.count({ where: { direction: "INBOUND", sentAt: { gte: dayStart }, conversation: { ...conv, account: { isSimulated: false } } } }),
    db().message.count({ where: { direction: "OUTBOUND", sentAt: { gte: dayStart }, conversation: { ...conv, account: { isSimulated: false } } } }),
    db().message.count({ where: { direction: "INBOUND", sentAt: { gte: dayStart }, conversation: { ...conv, account: { isSimulated: true } } } }),
    db().message.count({ where: { direction: "OUTBOUND", sentAt: { gte: dayStart }, conversation: { ...conv, account: { isSimulated: true } } } }),
  ]);
  const live = accounts.filter((a) => !a.isSimulated);
  const styles = await db().styleProfile.findMany({ where: { accountId: { in: accounts.map((a) => a.id) }, active: true }, select: { accountId: true, data: true } });

  return {
    status: {
      ai: {
        kind: aiSettings.provider === "offline" ? "sample" : aiSettings.verifiedModel && aiSettings.verifiedModel === aiSettings.replyModel ? "connected" : "needs_test",
        provider: aiSettings.provider,
        model: aiSettings.provider === "offline" ? null : aiSettings.replyModel,
      },
      messaging: {
        liveAccounts: live.length,
        connected: live.filter((a) => a.connectionStatus === "CONNECTED").length,
        problems: live.filter((a) => a.connectionStatus !== "CONNECTED" || a.lastSyncError).map((a) => ({ name: a.displayName, status: a.connectionStatus, detail: a.lastSyncError ?? a.connectionDetail })),
      },
    },
    aiHelping,
    models: accounts.map((a) => {
      const style = styles.find((s) => s.accountId === a.id);
      return {
        id: a.id,
        name: a.displayName,
        isSimulated: a.isSimulated,
        connectionStatus: a.connectionStatus,
        mode: modelMode(auto.globalMode, a.modeOverride),
        tone: (style?.data as { tone?: string } | undefined)?.tone ?? null,
        ...perModel.get(a.id)!,
      };
    }),
    attention: attention.slice(0, 8),
    attentionTotal: attention.length,
    today: { real: { received: inToday, sent: outToday }, simulated: { received: inTodaySim, sent: outTodaySim } },
    automation: { globalMode: auto.globalMode, emergencyStop: auto.emergencyStop, emergencyStopAt: auto.emergencyStopAt, dailyBudgetMicros: auto.dailyAiBudgetMicros },
    worker: { running: !!hbAt && Date.now() - hbAt.getTime() < 60_000, lastSeen: hbAt },
    accounts: accounts.map((a) => ({
      id: a.id,
      displayName: a.displayName,
      provider: a.provider,
      isSimulated: a.isSimulated,
      connectionStatus: a.connectionStatus,
      modeOverride: a.modeOverride,
      lastSyncOkAt: a.lastSyncOkAt,
      lastSyncError: a.lastSyncError,
    })),
    counts: { unread, handoffs, queued, proposed, uncertain },
    ai: { todayMicros: costToday._sum.costMicros ?? 0, calls: costToday._count, tokensIn: costToday._sum.tokensIn ?? 0, tokensOut: costToday._sum.tokensOut ?? 0, last7Micros: cost7._sum.costMicros ?? 0 },
    sales: {
      verified30d: {
        count: realSales._count,
        grossCents: realSales._sum.amountCents ?? 0,
        netCents: (realSales._sum.amountCents ?? 0) - (realSales._sum.refundedCents ?? 0) - (realSales._sum.feeCents ?? 0),
        feesKnown: realSales._count === 0 || realSales._sum.feeCents != null,
      },
      simulated30d: { count: simSales._count, grossCents: simSales._sum.amountCents ?? 0 },
    },
  };
}

export async function listConversations(user: SessionUser, opts: { filter?: string; q?: string; accountId?: string }) {
  const ids = await accessibleAccountIds(user);
  const accountIds = opts.accountId ? ids.filter((i) => i === opts.accountId) : ids;
  const where: any = { accountId: { in: accountIds } };
  if (opts.filter === "unread") where.unreadCount = { gt: 0 };
  if (opts.filter === "handoff") where.handoffs = { some: { status: { in: ["OPEN", "CLAIMED"] } } };
  if (opts.filter === "needs_you") where.OR = [{ handoffs: { some: { status: { in: ["OPEN", "CLAIMED"] } } } }, { drafts: { some: { status: { in: ["UNCERTAIN", "HANDOFF"] } } } }];
  if (opts.filter === "drafts") where.drafts = { some: { status: { in: ["PROPOSED", "QUEUED", "UNCERTAIN"] } } };
  if (opts.filter === "mine") where.takenOverById = user.id;
  if (opts.q) where.customer = { displayName: { contains: opts.q, mode: "insensitive" } };
  const auto = await getAutomation();
  const rows = await db().conversation.findMany({
    where,
    include: {
      account: true,
      customer: true,
      messages: { orderBy: { sentAt: "desc" }, take: 1 },
      drafts: { where: { status: { in: ["PROPOSED", "QUEUED", "UNCERTAIN", "SENDING", "HANDOFF"] } }, orderBy: { createdAt: "desc" }, take: 1 },
      handoffs: { where: { status: { in: ["OPEN", "CLAIMED"] } }, orderBy: { priority: "desc" }, take: 1 },
    },
    orderBy: [{ lastInboundAt: { sort: "desc", nulls: "last" } }],
    take: 200,
  });
  return rows.map((c) => {
    const pol = policyFor(c, auto);
    const last = c.messages[0];
    return {
      id: c.id,
      customer: { id: c.customer.id, name: c.customer.displayName, tags: c.customer.tags, intent: Math.round(decay(c.customer.intentScore, c.customer.intentUpdatedAt, new Date(), auto.rules.scoring.halfLifeHours)) },
      account: { id: c.account.id, name: c.account.displayName, isSimulated: c.account.isSimulated },
      mode: pol.mode,
      unread: c.unreadCount,
      lastMessage: last ? { body: last.body.slice(0, 120), direction: last.direction, at: last.sentAt } : null,
      lastInboundAt: c.lastInboundAt,
      draft: c.drafts[0] ? { status: c.drafts[0].status, scheduledFor: c.drafts[0].scheduledFor, nextAction: c.drafts[0].nextAction } : null,
      handoff: c.handoffs[0] ? { category: c.handoffs[0].category, priority: c.handoffs[0].priority, reason: c.handoffs[0].reason } : null,
      takenOver: !!c.takenOverById,
      isTour: c.account.isSimulated && c.externalChatId === "sim_tour_guest",
    };
  });
}

export async function conversationDetail(conversationId: string) {
  const auto = await getAutomation();
  const c = await db().conversation.findUniqueOrThrow({
    where: { id: conversationId },
    include: {
      account: true,
      customer: {
        include: {
          signals: { orderBy: { createdAt: "desc" }, take: 12 },
          purchases: { orderBy: { occurredAt: "desc" }, take: 10, include: { catalogItem: true } },
          offers: { orderBy: { createdAt: "desc" }, take: 10, include: { catalogItem: true } },
        },
      },
      messages: { orderBy: { sentAt: "asc" }, take: 200 },
      drafts: { orderBy: { createdAt: "desc" }, take: 8 },
      notes: { orderBy: { createdAt: "desc" }, take: 30, include: { user: { select: { name: true } } } },
      handoffs: { orderBy: { createdAt: "desc" }, take: 10 },
      jobs: { where: { status: { in: ["PENDING", "RUNNING"] } }, orderBy: { runAt: "asc" } },
    },
  });
  const sends = await db().outboundSend.findMany({ where: { conversationId, status: { in: ["UNCERTAIN", "FAILED", "PENDING", "IN_FLIGHT"] } }, orderBy: { createdAt: "desc" }, take: 10 });
  const pol = policyFor(c, auto);
  const provider = await providerForAccount(c.account).catch(() => null);
  const takenOverBy = c.takenOverById ? await db().user.findUnique({ where: { id: c.takenOverById }, select: { name: true } }) : null;
  const catalog = await db().catalogItem.findMany({ where: { accountId: c.accountId, active: true } });
  const decayed = decay(c.customer.intentScore, c.customer.intentUpdatedAt, new Date(), auto.rules.scoring.halfLifeHours);
  return {
    id: c.id,
    version: c.version,
    isTour: c.account.isSimulated && c.externalChatId === "sim_tour_guest",
    account: { id: c.account.id, name: c.account.displayName, isSimulated: c.account.isSimulated, connectionStatus: c.account.connectionStatus, capabilities: provider?.capabilities ?? null, providerLabel: provider?.label ?? "Provider not configured" },
    policy: { mode: pol.mode, reasons: pol.reasons, aiMayDraft: pol.aiMayDraft, aiMayAutoSend: pol.aiMayAutoSend, sendsAllowed: pol.sendsAllowed, override: c.modeOverride },
    takeover: c.takenOverById ? { by: takenOverBy?.name ?? "someone", at: c.takenOverAt, expiresAt: c.takeoverExpiresAt } : null,
    tags: c.tags,
    summary: c.summary,
    messages: c.messages.map((m) => ({ id: m.id, direction: m.direction, origin: m.origin, body: m.body, sentAt: m.sentAt, intentDelta: m.intentDelta })),
    drafts: c.drafts.map((d) => ({
      id: d.id,
      status: d.status,
      nextAction: d.nextAction,
      body: d.body,
      originalBody: d.originalBody,
      explanation: d.explanation,
      intendedMode: d.intendedMode,
      model: d.model,
      promptVersion: d.promptVersion,
      styleVersion: d.styleVersion,
      issues: d.validatorIssues,
      labels: d.labels,
      scheduledFor: d.scheduledFor,
      stale: d.basedOnVersion !== c.version,
      rejectedReason: d.rejectedReason,
      createdAt: d.createdAt,
      latencyMs: d.latencyMs,
      tokens: d.tokensIn + d.tokensOut,
      costMicros: d.costMicros,
    })),
    sends: sends.map((s) => ({ id: s.id, status: s.status, body: s.body, lastError: s.lastError, createdAt: s.createdAt, origin: s.origin })),
    notes: c.notes.map((n) => ({ id: n.id, body: n.body, by: n.user.name, at: n.createdAt })),
    handoffs: c.handoffs.map((h) => ({ id: h.id, category: h.category, reason: h.reason, status: h.status, priority: h.priority, evidence: h.evidence, createdAt: h.createdAt })),
    nextActions: c.jobs.map((j) => ({ id: j.id, type: j.type, runAt: j.runAt, status: j.status })),
    customer: {
      id: c.customer.id,
      name: c.customer.displayName,
      externalId: c.customer.externalId,
      tags: c.customer.tags,
      intent: Math.round(decayed),
      intentRaw: c.customer.intentScore,
      engagement: Math.round(c.customer.engagementScore),
      verifiedSpendCents: c.customer.verifiedSpendCents,
      outcome: c.customer.outcome,
      suppressedUntil: c.customer.suppressedUntil,
      doNotContact: c.customer.doNotContact,
      preferences: c.customer.preferences,
      variant: c.customer.experimentVariant,
      signals: c.customer.signals.map((s) => ({ id: s.id, signal: s.signal, weight: s.weight, evidence: s.evidence, at: s.createdAt, source: s.source })),
      purchases: c.customer.purchases.map((p) => ({ id: p.id, item: p.catalogItem?.title ?? "Unknown item", amountCents: p.amountCents, verified: p.verified, source: p.source, at: p.occurredAt, attribution: p.attribution })),
      offers: c.customer.offers.map((o) => ({ id: o.id, item: o.catalogItem.title, externalAssetId: o.catalogItem.externalAssetId, priceCents: o.priceCents, status: o.status, sentAt: o.sentAt })),
      completeness: {
        purchaseData: c.account.isSimulated ? "simulated transactions" : "manual entries only (provider transaction import not implemented)",
        signals: c.customer.signals.length,
      },
    },
    catalog: catalog.map((i) => ({ id: i.id, title: i.title, externalAssetId: i.externalAssetId, priceCents: i.priceCents, priceConfirmed: i.priceConfirmed })),
  };
}
