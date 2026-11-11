import { api } from "@/server/http";
import { listConversations } from "@/server/services/queries";

export const GET = api({ auth: "user" }, async ({ user, req }) => {
  const sp = req.nextUrl.searchParams;
  return listConversations(user, { filter: sp.get("filter") ?? undefined, q: sp.get("q")?.slice(0, 80) ?? undefined, accountId: sp.get("account") ?? undefined });
});
