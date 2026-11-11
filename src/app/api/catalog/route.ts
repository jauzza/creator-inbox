import { z } from "zod";
import { api } from "@/server/http";
import { db } from "@/server/db";
import { accessibleAccountIds, assertAccountAccess, requireOwner } from "@/server/auth/access";
import { audit } from "@/server/audit";

export const GET = api({ auth: "user" }, async ({ user }) => {
  const ids = await accessibleAccountIds(user);
  return { items: await db().catalogItem.findMany({ where: { accountId: { in: ids } }, include: { account: { select: { displayName: true } } }, orderBy: { createdAt: "asc" } }) };
});

const item = z.object({ accountId: z.string(), externalAssetId: z.string().min(1).max(100), title: z.string().min(1).max(80), description: z.string().min(1).max(300), priceCents: z.number().int().min(1).max(100000).nullable(), priceConfirmed: z.boolean(), active: z.boolean() });
const body = z.discriminatedUnion("action", [z.object({ action: z.literal("upsert"), id: z.string().optional(), item })]);

export const POST = api({ auth: "user", body }, async ({ user, body }) => {
  requireOwner(user);
  await assertAccountAccess(user, body.item.accountId);
  // Human-controlled catalog: the AI may only state facts entered here.
  const saved = body.id
    ? await db().catalogItem.update({ where: { id: body.id }, data: body.item })
    : await db().catalogItem.create({ data: body.item });
  await audit("catalog.upsert", { actorId: user.id, target: saved.id, details: { price: body.item.priceCents, confirmed: body.item.priceConfirmed } });
  return { id: saved.id };
});
