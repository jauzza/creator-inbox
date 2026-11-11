import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionUser, SESSION_COOKIE } from "@/server/auth/session";
import { Shell } from "@/components/shell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser((await cookies()).get(SESSION_COOKIE)?.value);
  if (!user) redirect("/login");
  return (
    <Shell me={{ id: user.id, email: user.email, name: user.name, role: user.role, csrfToken: user.csrfToken, onboarded: !!user.onboardedAt, tourDone: !!user.tourCompletedAt }}>
      {children}
    </Shell>
  );
}
