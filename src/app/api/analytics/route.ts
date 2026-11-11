import { api } from "@/server/http";
import { analytics } from "@/server/services/analytics";
import { accessibleAccountIds } from "@/server/auth/access";

export const GET = api({ auth: "user" }, async ({ user, req }) => {
  const sp = req.nextUrl.searchParams;
  const days = Math.min(365, Math.max(1, Number(sp.get("days") ?? 30)));
  return analytics({ days, includeSimulated: sp.get("sim") === "1", accountIds: await accessibleAccountIds(user) });
});
