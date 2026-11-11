"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Activity, BarChart3, Bell, Bot, FlaskConical, Gauge, HelpCircle, Inbox, LifeBuoy, LogOut, Menu, OctagonX, Plug, Settings2, Sparkles, Users, X } from "lucide-react";
import { Button, cn, Dialog, ModeBadge, ToastProvider, useAction, Badge } from "./ui";
import { post, setCsrf, useApi, ago } from "@/lib/client";

export type Me = { id: string; email: string; name: string; role: "OWNER" | "OPERATOR"; csrfToken: string };

const NAV = [
  { href: "/", label: "Overview", icon: Gauge },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/handoffs", label: "Handoffs", icon: LifeBuoy },
  { href: "/automation", label: "Automation", icon: Bot },
  { href: "/style", label: "Creator style", icon: Sparkles },
  { href: "/integrations", label: "Integrations", icon: Plug },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/simulator", label: "Simulator", icon: FlaskConical },
  { href: "/activity", label: "Activity & settings", icon: Settings2 },
  { href: "/help", label: "Guide", icon: HelpCircle },
];

export function Shell({ me, children }: { me: Me; children: ReactNode }) {
  setCsrf(me.csrfToken);
  return (
    <ToastProvider>
      <ShellInner me={me}>{children}</ShellInner>
    </ToastProvider>
  );
}

function ShellInner({ me, children }: { me: Me; children: ReactNode }) {
  const path = usePathname();
  const [navOpen, setNavOpen] = useState(false);
  const auto = useApi<{ globalMode: "AUTO" | "DRAFT" | "PAUSED"; emergencyStop: boolean; emergencyStopAt: string | null }>("/api/automation", { poll: 10000 });
  useEffect(() => setNavOpen(false), [path]);

  const nav = (
    <nav aria-label="Main" className="flex flex-col gap-0.5 p-2">
      {NAV.map((n) => {
        const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? "page" : undefined}
            className={cn("flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px]", active ? "bg-panel-2 text-fg" : "text-muted hover:bg-panel-2 hover:text-fg")}
          >
            <n.icon className="size-4 shrink-0" aria-hidden />
            {n.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="flex min-h-dvh">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-line bg-panel lg:flex">
        <div className="flex h-14 items-center gap-2 border-b border-line px-4">
          <Activity className="size-4 text-accent" aria-hidden />
          <span className="text-sm font-semibold tracking-tight">Creator Inbox</span>
        </div>
        {nav}
        <div className="mt-auto border-t border-line p-3 text-[11px] text-faint">
          {me.name} · {me.role.toLowerCase()}
        </div>
      </aside>
      {navOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setNavOpen(false)}>
          <aside className="h-full w-64 border-r border-line bg-panel" onClick={(e) => e.stopPropagation()}>
            <div className="flex h-14 items-center justify-between border-b border-line px-4">
              <span className="text-sm font-semibold">Creator Inbox</span>
              <Button size="icon" variant="ghost" onClick={() => setNavOpen(false)} aria-label="Close menu">
                <X className="size-4" />
              </Button>
            </div>
            {nav}
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-bg/95 px-3 backdrop-blur sm:px-4">
          <Button size="icon" variant="ghost" className="lg:hidden" onClick={() => setNavOpen(true)} aria-label="Open menu">
            <Menu className="size-4" />
          </Button>
          {auto.data && (
            <div className="flex min-w-0 items-center gap-2 text-xs text-muted">
              <span className="hidden sm:inline">Global:</span>
              {auto.data.emergencyStop ? <Badge tone="danger">Emergency stop</Badge> : <ModeBadge mode={auto.data.globalMode} />}
            </div>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            <EmergencyStop state={auto.data} reload={auto.reload} isOwner={me.role === "OWNER"} />
            <Notifications />
            <Button
              size="icon"
              variant="ghost"
              aria-label="Sign out"
              title="Sign out"
              onClick={async () => {
                await post("/api/auth/logout", {});
                location.href = "/login";
              }}
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        </header>
        {auto.data?.emergencyStop && (
          <div role="alert" className="border-b border-danger/40 bg-danger/10 px-4 py-2 text-xs text-danger">
            Emergency stop is ON since {ago(auto.data.emergencyStopAt)}. No messages will be sent. A request already accepted by the provider before the stop may not be retractable.
          </div>
        )}
        <main className="min-w-0 flex-1 p-3 sm:p-5">{children}</main>
      </div>
    </div>
  );
}

function EmergencyStop({ state, reload, isOwner }: { state: { emergencyStop: boolean } | null; reload: () => void; isOwner: boolean }) {
  const [open, setOpen] = useState(false);
  const { busy, run } = useAction();
  if (!state) return null;
  const on = state.emergencyStop;
  return (
    <>
      <Button variant={on ? "secondary" : "danger"} size="sm" onClick={() => setOpen(true)} aria-label={on ? "Release emergency stop" : "Emergency stop"} disabled={on && !isOwner} title={on && !isOwner ? "Only the owner can release the stop" : undefined}>
        <OctagonX className="size-3.5" aria-hidden />
        <span className="hidden sm:inline">{on ? "Release stop" : "Stop all sends"}</span>
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={on ? "Release emergency stop?" : "Stop all sending now?"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant={on ? "primary" : "danger"}
              loading={busy === "stop"}
              onClick={() =>
                run(
                  "stop",
                  async () => {
                    const r = await post("/api/automation", { action: "emergency_stop", on: !on });
                    setOpen(false);
                    reload();
                    return r;
                  },
                  (r: any) => (on ? "Emergency stop released" : `Stopped. ${r.reverted ?? 0} queued replies held${r.inFlight ? `; ${r.inFlight} already in flight` : ""}.`),
                )
              }
            >
              {on ? "Release" : "Stop everything"}
            </Button>
          </>
        }
      >
        {on ? (
          <p className="text-[13px] text-muted">Sending resumes according to each conversation's mode. Held replies stay as drafts until someone approves them.</p>
        ) : (
          <div className="space-y-2 text-[13px] text-muted">
            <p>Every new send attempt is blocked immediately: automatic replies, approved drafts and manual messages.</p>
            <p>Queued replies return to Draft. A message the provider has already accepted cannot be pulled back.</p>
          </div>
        )}
      </Dialog>
    </>
  );
}

function Notifications() {
  const [open, setOpen] = useState(false);
  const n = useApi<{ unread: number; items: { id: string; title: string; body: string; link: string | null; readAt: string | null; createdAt: string }[] }>("/api/notifications", { poll: 15000 });
  return (
    <div className="relative">
      <Button size="icon" variant="ghost" aria-label={`Notifications${n.data?.unread ? ` (${n.data.unread} unread)` : ""}`} onClick={() => setOpen((o) => !o)}>
        <Bell className="size-4" />
        {!!n.data?.unread && <span className="absolute right-1 top-1 min-w-4 rounded-full bg-danger px-1 text-[10px] leading-4 text-white">{n.data.unread}</span>}
      </Button>
      {open && (
        <div className="absolute right-0 top-10 z-50 w-[min(92vw,360px)] rounded-lg border border-line-strong bg-panel shadow-xl">
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <span className="text-xs font-semibold">Notifications</span>
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                await post("/api/notifications", { all: true });
                n.reload();
              }}
            >
              Mark all read
            </Button>
          </div>
          <ul className="max-h-96 divide-y divide-line overflow-y-auto">
            {n.data?.items.length === 0 && <li className="p-4 text-xs text-muted">Nothing yet.</li>}
            {n.data?.items.map((i) => (
              <li key={i.id} className={cn("px-3 py-2", !i.readAt && "bg-panel-2")}>
                <Link href={i.link ?? "#"} onClick={() => setOpen(false)} className="block">
                  <p className="text-[13px] font-medium">{i.title}</p>
                  <p className="text-xs text-muted">{i.body}</p>
                  <p className="text-[11px] text-faint">{ago(i.createdAt)}</p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
