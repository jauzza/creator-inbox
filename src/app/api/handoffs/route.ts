import { api } from "@/server/http";
import { db } from "@/server/db";
import { accessibleAccountIds } from "@/server/auth/access";
import { CATEGORY_LABEL } from "@/server/scoring/triage";

export const GET = api({ auth: "user" }, async ({ user, req }) => {
  const ids = await accessibleAccountIds(user);
  const status = req.nextUrl.searchParams.get("status") === "resolved" ? ["RESOLVED" as const] : ["OPEN" as const, "CLAIMED" as const];
  const rows = await db().handoff.findMany({
    where: { status: { in: status }, conversation: { accountId: { in: ids } } },
    include: { conversation: { include: { customer: true, account: true } } },
    orderBy: status[0] === "RESOLVED" ? [{ resolvedAt: "desc" }] : [{ priority: "desc" }, { createdAt: "asc" }],
    take: 200,
  });
  const owners = await db().user.findMany({ where: { id: { in: rows.map((r) => r.ownerId).filter(Boolean) as string[] } }, select: { id: true, name: true } });
  return rows.map((h) => ({
    id: h.id,
    conversationId: h.conversationId,
    category: h.category,
    label: CATEGORY_LABEL[h.category as keyof typeof CATEGORY_LABEL] ?? h.category,
    reason: h.reason,
    evidence: h.evidence,
    priority: h.priority,
    status: h.status,
    createdAt: h.createdAt,
    resolvedAt: h.resolvedAt,
    outcome: h.outcome,
    useful: h.useful,
    owner: owners.find((o) => o.id === h.ownerId)?.name ?? null,
    ownerId: h.ownerId,
    customer: h.conversation.customer.displayName,
    account: h.conversation.account.displayName,
    isSimulated: h.conversation.account.isSimulated,
  }));
});
