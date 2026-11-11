import { db } from "../db";

/**
 * Analytics with explicit data sources. Every metric states where it comes from; simulated data is
 * always reported separately; revenue is "verified" only when backed by transaction records.
 */
export async function analytics(opts: { days: number; includeSimulated: boolean; accountIds: string[] }) {
  const since = new Date(Date.now() - opts.days * 86400000);
  const sim = opts.includeSimulated ? {} : { isSimulated: false };
  const convWhere = { accountId: { in: opts.accountIds }, ...(opts.includeSimulated ? {} : { account: { isSimulated: false } }) };

  // Response time: first outbound after each inbound burst (messages table).
  const msgs = await db().message.findMany({ where: { sentAt: { gte: since }, conversation: convWhere }, orderBy: [{ conversationId: "asc" }, { sentAt: "asc" }], select: { conversationId: true, direction: true, sentAt: true, origin: true } });
  const responseTimes: { sec: number; origin: string }[] = [];
  let pending: { conv: string; at: Date } | null = null;
  for (const m of msgs) {
    if (pending && pending.conv !== m.conversationId) pending = null;
    if (m.direction === "INBOUND" && !pending) pending = { conv: m.conversationId, at: m.sentAt };
    else if (m.direction === "OUTBOUND" && pending) {
      responseTimes.push({ sec: (m.sentAt.getTime() - pending.at.getTime()) / 1000, origin: m.origin });
      pending = null;
    }
  }
  const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : null);

  const fe = await db().funnelEvent.groupBy({ by: ["type"], where: { createdAt: { gte: since }, ...sim }, _count: true });
  const funnel = Object.fromEntries(fe.map((f) => [f.type, f._count]));
  const drafted = funnel.reply_drafted ?? 0;
  const approved = funnel.reply_approved ?? 0;
  const edited = funnel.reply_edited ?? 0;
  const rejected = funnel.reply_rejected ?? 0;
  const reviewed = approved + edited + rejected;

  const labelRows = await db().draft.findMany({ where: { createdAt: { gte: since }, conversation: convWhere, labels: { isEmpty: false } }, select: { labels: true } });
  const labels: Record<string, number> = {};
  for (const r of labelRows) for (const l of r.labels) labels[l] = (labels[l] ?? 0) + 1;

  const handoffs = await db().handoff.groupBy({ by: ["category", "status"], where: { createdAt: { gte: since }, conversation: convWhere }, _count: true });
  const usefulRows = await db().handoff.groupBy({ by: ["useful"], where: { createdAt: { gte: since }, status: "RESOLVED", conversation: convWhere }, _count: true });

  const purchases = await db().purchase.findMany({ where: { occurredAt: { gte: since }, customer: { accountId: { in: opts.accountIds } }, ...(opts.includeSimulated ? {} : { source: { not: "simulator" } }) } });
  const verified = purchases.filter((p) => p.verified);
  const usage = await db().aiUsage.groupBy({ by: ["model", "purpose"], where: { createdAt: { gte: since } }, _sum: { tokensIn: true, tokensOut: true, costMicros: true, latencyMs: true }, _count: true });
  const aiCostMicros = usage.reduce((s, u) => s + (u._sum.costMicros ?? 0), 0);
  const gross = verified.reduce((s, p) => s + p.amountCents, 0);
  const refunds = verified.reduce((s, p) => s + p.refundedCents, 0);
  const fees = verified.reduce((s, p) => s + (p.feeCents ?? 0), 0);
  const feesUnknown = verified.filter((p) => p.feeCents == null).length;

  // Experiment readout (customer-level variants)
  const variantDrafts = await db().draft.groupBy({ by: ["variant", "status"], where: { createdAt: { gte: since }, variant: { not: null }, conversation: convWhere }, _count: true });

  return {
    window: { days: opts.days, since, includeSimulated: opts.includeSimulated },
    responseTime: {
      source: "Message timestamps (provider-reported). First outbound after each inbound burst.",
      samples: responseTimes.length,
      medianSecAll: median(responseTimes.map((r) => r.sec)),
      medianSecAi: median(responseTimes.filter((r) => r.origin.startsWith("AI")).map((r) => r.sec)),
      medianSecHuman: median(responseTimes.filter((r) => r.origin === "HUMAN").map((r) => r.sec)),
    },
    drafts: {
      source: "Funnel events recorded when drafts are created, approved, edited, rejected and sent.",
      drafted,
      approvedUnchanged: approved,
      approvedEdited: edited,
      rejected,
      sent: funnel.reply_sent ?? 0,
      approvalRate: reviewed ? (approved + edited) / reviewed : null,
      editRate: approved + edited ? edited / (approved + edited) : null,
      labels,
    },
    handoffs: {
      source: "Handoff records; 'useful' is set by the operator when resolving.",
      byCategory: handoffs.map((h) => ({ category: h.category, status: h.status, count: h._count })),
      useful: Object.fromEntries(usefulRows.map((u) => [String(u.useful), u._count])),
      takeovers: funnel.takeover ?? 0,
    },
    revenue: {
      source: "Purchase records. 'Verified' = backed by a transaction record (provider or simulator); manual entries are unverified.",
      verifiedCount: verified.length,
      grossCents: gross,
      refundsCents: refunds,
      knownFeesCents: fees,
      feesUnknownCount: feesUnknown,
      aiCostMicros,
      netAfterKnownFeesRefundsAndAiCents: gross - refunds - fees - Math.round(aiCostMicros / 10000),
      unverifiedCount: purchases.length - verified.length,
      unverifiedCents: purchases.filter((p) => !p.verified).reduce((s, p) => s + p.amountCents, 0),
      attributed: verified.filter((p) => p.attribution.startsWith("offer:")).length,
      unknownAttribution: verified.filter((p) => p.attribution === "unknown").length,
      offersSent: funnel.offer_sent ?? 0,
      declines: funnel.decline ?? 0,
      caveat:
        verified.length < 30
          ? `Only ${verified.length} verified purchases in this window: too few to compare variants or claim an effect. Before/after comparisons are not causal.`
          : "Differences between variants may still reflect pricing, catalog, operator coverage or seasonality.",
    },
    modelUsage: {
      source: "AiUsage rows; cost is an ESTIMATE from token counts × configured price per model.",
      rows: usage.map((u) => ({ model: u.model, purpose: u.purpose, calls: u._count, tokensIn: u._sum.tokensIn ?? 0, tokensOut: u._sum.tokensOut ?? 0, costMicros: u._sum.costMicros ?? 0, avgLatencyMs: u._count ? Math.round((u._sum.latencyMs ?? 0) / u._count) : 0 })),
    },
    experiment: {
      source: "Drafts tagged with the customer's stable variant. Human takeover is tracked separately as an intervention.",
      rows: variantDrafts.map((v) => ({ variant: v.variant, status: v.status, count: v._count })),
    },
  };
}
