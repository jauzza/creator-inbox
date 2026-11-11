import { api } from "@/server/http";
import { db } from "@/server/db";
import { accessibleAccountIds } from "@/server/auth/access";
import { getAutomation } from "@/server/automation/settings";
import { decay } from "@/server/scoring/intent";

export const GET = api({ auth: "user" }, async ({ user, req }) => {
  const ids = await accessibleAccountIds(user);
  const sp = req.nextUrl.searchParams;
  const tag = sp.get("tag");
  const q = sp.get("q")?.slice(0, 80);
  const auto = await getAutomation();
  const rows = await db().customer.findMany({
    where: { accountId: { in: ids }, ...(tag ? { tags: { has: tag } } : {}), ...(q ? { displayName: { contains: q, mode: "insensitive" } } : {}) },
    include: {
      account: { select: { displayName: true, isSimulated: true } },
      signals: { orderBy: { createdAt: "desc" }, take: 3 },
      purchases: { select: { verified: true, amountCents: true, source: true } },
      conversations: { select: { id: true }, take: 1 },
    },
    take: 500,
  });
  const users = await db().user.findMany({ select: { id: true, name: true } });
  return {
    users,
    customers: rows.map((c) => ({
      id: c.id,
      name: c.displayName,
      account: c.account.displayName,
      isSimulated: c.account.isSimulated,
      tags: c.tags,
      intent: Math.round(decay(c.intentScore, c.intentUpdatedAt, new Date(), auto.rules.scoring.halfLifeHours)),
      intentUpdatedAt: c.intentUpdatedAt,
      engagement: Math.round(c.engagementScore),
      evidence: c.signals.map((s) => `${s.signal} (+${s.weight}): “${s.evidence}”`),
      verifiedSpendCents: c.purchases.filter((p) => p.verified).reduce((s, p) => s + p.amountCents, 0),
      unverifiedSpendCents: c.purchases.filter((p) => !p.verified).reduce((s, p) => s + p.amountCents, 0),
      purchaseCount: c.purchases.length,
      outcome: c.outcome,
      suppressedUntil: c.suppressedUntil,
      doNotContact: c.doNotContact,
      assignedUserId: c.assignedUserId,
      conversationId: c.conversations[0]?.id ?? null,
    })),
  };
});
