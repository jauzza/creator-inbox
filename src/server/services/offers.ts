import { db } from "../db";
import { sha256 } from "../crypto/secrets";
import { HttpError } from "../auth/access";
import { audit } from "../audit";

/**
 * Offer ledger for PPV-style opportunities. v1 never sends paid messages through a provider API:
 * the operator sends on the platform after approving here, then marks it sent. Approval freezes
 * recipient + existing asset + price; any change invalidates it.
 */
export function approvalHash(customerId: string, externalAssetId: string, priceCents: number) {
  return sha256(`${customerId}|${externalAssetId}|${priceCents}`);
}

export async function proposeOffer(userId: string, input: { customerId: string; catalogItemId: string; priceCents: number; allowRepeat?: boolean; overrideSuppression?: boolean; note?: string }) {
  const customer = await db().customer.findUniqueOrThrow({ where: { id: input.customerId } });
  const item = await db().catalogItem.findUniqueOrThrow({ where: { id: input.catalogItemId } });
  if (item.accountId !== customer.accountId) throw new HttpError(400, "Catalog item belongs to a different account");
  if (!item.active) throw new HttpError(400, "Catalog item is inactive");
  if (!Number.isInteger(input.priceCents) || input.priceCents <= 0) throw new HttpError(400, "Price must be a positive amount");
  if (customer.doNotContact) throw new HttpError(409, "Customer asked not to be contacted");
  const suppressed = customer.suppressedUntil && customer.suppressedUntil > new Date();
  if (suppressed && !input.overrideSuppression)
    throw new HttpError(409, `Customer declined recently; offers are suppressed until ${customer.suppressedUntil!.toISOString().slice(0, 10)}`);
  const bought = await db().purchase.count({ where: { customerId: customer.id, catalogItemId: item.id, verified: true } });
  if (bought && !input.allowRepeat) throw new HttpError(409, `Customer already bought “${item.title}”. Tick “allow repeat” only if that's intended.`);
  const offer = await db().offer.create({
    data: { customerId: customer.id, catalogItemId: item.id, priceCents: input.priceCents, allowRepeat: !!input.allowRepeat, operatorId: userId, note: input.note?.slice(0, 300) },
  });
  await audit("offer.proposed", { actorId: userId, target: offer.id, details: { price: input.priceCents, overrideSuppression: !!input.overrideSuppression } });
  return offer;
}

/** Human confirmation: the operator re-types/confirms recipient, asset and price; all must match the record. */
export async function approveOffer(userId: string, offerId: string, confirm: { customerId: string; externalAssetId: string; priceCents: number }) {
  const offer = await db().offer.findUniqueOrThrow({ where: { id: offerId }, include: { catalogItem: true } });
  if (offer.status !== "PROPOSED") throw new HttpError(409, `Offer is ${offer.status}`);
  if (confirm.customerId !== offer.customerId || confirm.externalAssetId !== offer.catalogItem.externalAssetId || confirm.priceCents !== offer.priceCents)
    throw new HttpError(409, "Confirmation does not match the offer (recipient, asset and price must all match)");
  const updated = await db().offer.update({
    where: { id: offerId },
    data: { status: "APPROVED", approvalHash: approvalHash(offer.customerId, offer.catalogItem.externalAssetId, offer.priceCents), approvedById: userId, approvedAt: new Date() },
  });
  await audit("offer.approved", { actorId: userId, target: offerId });
  return updated;
}

export async function markOfferSent(userId: string, offerId: string) {
  const offer = await db().offer.findUniqueOrThrow({ where: { id: offerId }, include: { catalogItem: true, customer: { include: { account: true } } } });
  if (offer.status !== "APPROVED" || !offer.approvalHash) throw new HttpError(409, "Offer must be approved first");
  const current = approvalHash(offer.customerId, offer.catalogItem.externalAssetId, offer.priceCents);
  if (current !== offer.approvalHash) {
    await db().offer.update({ where: { id: offerId }, data: { status: "PROPOSED", approvalHash: null, approvedById: null, approvedAt: null } });
    throw new HttpError(409, "Offer details changed after approval; approval was invalidated. Re-approve.");
  }
  await db().offer.update({ where: { id: offerId }, data: { status: "SENT", sentAt: new Date() } });
  await db().customer.update({ where: { id: offer.customerId }, data: { outcome: "CONTACTED" } });
  await db().funnelEvent.create({ data: { type: "offer_sent", customerId: offer.customerId, offerId, isSimulated: offer.customer.account.isSimulated } });
  await audit("offer.sent", { actorId: userId, target: offerId });
}

export async function updateOfferPrice(userId: string, offerId: string, priceCents: number) {
  const offer = await db().offer.findUniqueOrThrow({ where: { id: offerId } });
  if (!["PROPOSED", "APPROVED"].includes(offer.status)) throw new HttpError(409, `Offer is ${offer.status}`);
  // Changing price after approval invalidates the approval.
  await db().offer.update({ where: { id: offerId }, data: { priceCents, status: "PROPOSED", approvalHash: null, approvedById: null, approvedAt: null } });
  await audit("offer.price_changed", { actorId: userId, target: offerId, details: { priceCents } });
}

export async function setOfferStatus(userId: string, offerId: string, status: "DECLINED" | "CANCELLED" | "UNKNOWN") {
  const offer = await db().offer.update({ where: { id: offerId }, data: { status }, include: { customer: { include: { account: true } } } });
  if (status === "DECLINED") {
    const rules = (await db().automationSettings.findUnique({ where: { id: "global" } }))?.rules as any;
    const days = Number(rules?.offers?.declineCooldownDays ?? 14);
    await db().customer.update({ where: { id: offer.customerId }, data: { outcome: "DECLINED", declinedAt: new Date(), suppressedUntil: new Date(Date.now() + days * 86400000) } });
    await db().funnelEvent.create({ data: { type: "decline", customerId: offer.customerId, offerId, isSimulated: offer.customer.account.isSimulated } });
  }
  await audit(`offer.${status.toLowerCase()}`, { actorId: userId, target: offerId });
}

/** Manually recorded purchases are operator-reported and therefore NOT verified. */
export async function recordManualPurchase(userId: string, input: { customerId: string; catalogItemId?: string; amountCents: number; note?: string }) {
  const p = await db().purchase.create({
    data: { customerId: input.customerId, catalogItemId: input.catalogItemId, amountCents: input.amountCents, verified: false, source: "manual", occurredAt: new Date() },
  });
  await audit("purchase.manual", { actorId: userId, target: p.id });
  return p;
}
