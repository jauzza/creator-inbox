import { api } from "@/server/http";
import { overview } from "@/server/services/queries";

export const GET = api({ auth: "user" }, async ({ user }) => overview(user));
