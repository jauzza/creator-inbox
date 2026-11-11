import { z } from "zod";
import { api } from "@/server/http";
import { db } from "@/server/db";
import { assertAccountAccess } from "@/server/auth/access";
import { proposeOffer, approveOffer, markOfferSent, setOfferStatus, updateOfferPrice, recordManualPurchase } from "@/server/services/offers";

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("propose"), customerId: z.string(), catalogItemId: z.string(), priceCents: z.number().int().min(1), allowRepeat: z.boolean().optional(), overrideSuppression: z.boolean().optional(), note: z.string().max(300).optional() }),
  z.object({ action: z.literal("approve"), offerId: z.string(), confirm: z.object({ customerId: z.string(), externalAssetId: z.string(), priceCents: z.number().int() }) }),
  z.object({ action: z.literal("mark_sent"), offerId: z.string() }),
  z.object({ action: z.literal("price"), offerId: z.string(), priceCents: z.number().int().min(1) }),
  z.object({ action: z.literal("status"), offerId: z.string(), status: z.enum(["DECLINED", "CANCELLED", "UNKNOWN"]) }),
  z.object({ action: z.literal("manual_purchase"), customerId: z.string(), catalogItemId: z.string().optional(), amountCents: z.number().int().min(0) }),
]);

export const POST = api({ auth: "user", body }, async ({ user, body }) => {
  const customerId = "customerId" in body ? body.customerId : (await db().offer.findUniqueOrThrow({ where: { id: body.offerId } })).customerId;
  const c = await db().customer.findUniqueOrThrow({ where: { id: customerId } });
  await assertAccountAccess(user, c.accountId);
  switch (body.action) {
    case "propose":
      return proposeOffer(user.id, body);
    case "approve":
      return approveOffer(user.id, body.offerId, body.confirm);
    case "mark_sent":
      return markOfferSent(user.id, body.offerId);
    case "price":
      return updateOfferPrice(user.id, body.offerId, body.priceCents);
    case "status":
      return setOfferStatus(user.id, body.offerId, body.status);
    case "manual_purchase":
      return recordManualPurchase(user.id, body);
  }
});
