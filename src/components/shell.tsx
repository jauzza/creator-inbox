"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Bell, Compass, Home, Inbox, LogOut, MessageCircleHeart, MoreHorizontal, OctagonX, Settings } from "lucide-react";
import { Badge, Button, cn, Dialog, ToastProvider, useAction, type Mode } from "./ui";
import { post, setCsrf, useApi, ago } from "@/lib/client";
import { TourProvider, useTour } from "./tour/tour";

export type Me = { id: string; email: string; name: string; role: "OWNER" | "OPERATOR"; csrfToken: string };

const NAV = [
  { href: "/", label: "Home", icon: Home, tour: "nav-home" },
  { href: "/inbox", label: "Inbox", icon: Inbox, tour: "nav-inbox" },
  { href: "/settings", label: "Settings", icon: Settings, tour: "nav-settings" },
];

type AutoState = { globalMode: Mode; emergencyStop: boolean; emergencyStopAt: string | null; accounts?: { id: string; displayName: string; mode: Mode }[] };

function summary(auto: AutoState) {
  const models = auto.accounts ?? [];
  const autoN = models.filter((m) => m.mode === "AUTO").length;
  if (auto.emergencyStop) return { label: "Sending stopped", tone: "danger" as const, hint: "Nothing will be sent until you release the stop." };
  if (autoN) return { label: `Auto-reply on · ${autoN} of ${models.length}`, tone: "ok" as const, hint: `${models.filter((m) => m.mode === "AUTO").map((m) => m.displayName.replace(" (Demo)", "")).join(", ")} ${autoN === 1 ? "replies" : "reply"} by itself. Others wait for you.` };
  if (models.length && models.every((m) => m.mode === "PAUSED" || m.mode === "MANUAL")) return { label: "AI off", tone: "danger" as const, hint: "No drafts and no automatic replies." };
  return { label: "Drafts only", tone: "accent" as const, hint: "The AI writes drafts. You approve every send." };
}
type ShellCtx = { me: Me; auto: AutoState | null; reloadAuto: () => void; openStop: () => void; attention: number };
const Ctx = createContext<ShellCtx | null>(null);
export const useShell = () => useContext(Ctx)!;



export function Shell({ me, children }: { me: Me; children: ReactNode }) {
  setCsrf(me.csrfToken);
  return (
    <ToastProvider>
      <ShellInner me={me}>{children}</ShellInner>
    </ToastProvider>
  );
}

function ShellInner({ me, children }: { me: Me; children: ReactNode }) {
  const auto = useApi<AutoState>("/api/automation", { poll: 10000 });
  const ov = useApi<{ attentionTotal: number }>("/api/overview", { poll: 20000 });
  const [stopOpen, setStopOpen] = useState(false);
  const openStop = useCallback(() => setStopOpen(true), []);
  const ctx: ShellCtx = { me, auto: auto.data, reloadAuto: auto.reload, openStop, attention: ov.data?.attentionTotal ?? 0 };
  useEffect(() => {
    if (localStorage.getItem("ci.motion") === "reduced") document.documentElement.dataset.motion = "reduced";
  }, []);
  return (
    <Ctx.Provider value={ctx}>
      <TourProvider onEmergency={openStop} stopOn={!!auto.data?.emergencyStop}>
        <Frame>{children}</Frame>
        <EmergencyDialog open={stopOpen} onClose={() => setStopOpen(false)} />
      </TourProvider>
    </Ctx.Provider>
  );
}

function Frame({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { me, auto, attention } = useShell();
  const fullBleed = path.startsWith("/inbox");
  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <div className="flex min-h-dvh">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-[232px] shrink-0 flex-col border-r border-line bg-panel/50 lg:flex">
        <div className="flex h-14 items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2 rounded-md">
            <Logo />
            <span className="text-[14px] font-semibold tracking-[-0.01em]">Creator Inbox</span>
          </Link>
          <Notifications />
        </div>
        <nav aria-label="Main" className="flex flex-col gap-0.5 px-2.5 pt-2">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              data-tour={n.tour}
              aria-current={isActive(n.href) ? "page" : undefined}
              className={cn("group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-medium transition-colors", isActive(n.href) ? "bg-panel-3 text-fg" : "text-muted hover:bg-panel-2 hover:text-fg")}
            >
              <n.icon className={cn("size-[17px] shrink-0", isActive(n.href) ? "text-accent" : "text-faint group-hover:text-muted")} aria-hidden />
              {n.label}
              {n.href === "/inbox" && attention > 0 && (
                <span className="ml-auto rounded-full bg-warn/15 px-1.5 text-[11px] font-semibold tabular-nums text-warn" title={`${attention} conversation(s) need you`}>
                  {attention}
                </span>
              )}
            </Link>
          ))}
        </nav>
        <div className="mt-auto space-y-2 p-2.5">
          <AutomationCard />
          <TourButton />
          <div className="flex items-center justify-between rounded-lg px-2.5 py-1.5">
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium">{me.name}</p>
              <p className="truncate text-[11px] text-faint">{me.role === "OWNER" ? "Owner" : "Team member"}</p>
            </div>
            <SignOut />
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-bg/90 px-3 backdrop-blur-xl lg:hidden">
          <Link href="/" className="flex items-center gap-2" aria-label="Home">
            <Logo />
          </Link>
          {auto && <ModePill />}
          <div className="ml-auto flex items-center gap-1">
            <StopButton compact />
            <Notifications />
            <MobileMore />
          </div>
        </header>
        {auto?.emergencyStop && <StopBanner at={auto.emergencyStopAt} />}
        <main className={cn("min-w-0 flex-1", fullBleed ? "" : "px-4 pb-24 pt-5 sm:px-6 lg:px-10 lg:pb-12 lg:pt-8")}>{children}</main>

        {/* Mobile tab bar */}
        <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t border-line bg-bg/92 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} data-tour={n.tour} aria-current={isActive(n.href) ? "page" : undefined} className={cn("relative flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium", isActive(n.href) ? "text-fg" : "text-faint")}>
              <n.icon className={cn("size-5", isActive(n.href) && "text-accent")} aria-hidden />
              {n.label}
              {n.href === "/inbox" && attention > 0 && <span className="absolute right-[calc(50%-20px)] top-2.5 size-2 rounded-full bg-warn" aria-label={`${attention} need you`} />}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}

function Logo() {
  return (
    <span className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-[#5b5ce0] shadow-[0_4px_14px_-4px_var(--color-accent)]">
      <MessageCircleHeart className="size-4 text-white" aria-hidden />
    </span>
  );
}

function ModePill() {
  const { auto } = useShell();
  if (!auto) return null;
  if (auto.emergencyStop) return <Badge tone="danger" dot>Sending stopped</Badge>;
  const g = summary(auto);
  return (
    <Link href="/settings/automation" title={g.hint}>
      <Badge tone={g.tone} dot>
        {g.label}
      </Badge>
    </Link>
  );
}

function AutomationCard() {
  const { auto } = useShell();
  if (!auto) return <div className="h-[108px] rounded-xl border border-line" />;
  const g = summary(auto);
  return (
    <div className="rounded-xl border border-line bg-panel p-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-faint">Automation</span>
        <Link href="/settings/automation" className="text-[11px] text-faint hover:text-fg">
          Change
        </Link>
      </div>
      <p className="mt-1.5 flex items-center gap-1.5 text-[13px] font-medium">
        <span className={cn("size-2 rounded-full", auto.emergencyStop ? "bg-danger" : g.tone === "ok" ? "bg-ok" : g.tone === "danger" ? "bg-danger" : "bg-accent")} aria-hidden />
        {g.label}
      </p>
      <p className="mt-0.5 text-[11.5px] leading-snug text-muted">{g.hint}</p>
      <StopButton />
    </div>
  );
}

function StopButton({ compact }: { compact?: boolean }) {
  const { auto, openStop, me } = useShell();
  if (!auto) return null;
  const on = auto.emergencyStop;
  const blocked = on && me.role !== "OWNER";
  return (
    <Button
      data-tour="emergency-stop"
      size={compact ? "sm" : "sm"}
      variant={on ? "secondary" : "danger"}
      onClick={openStop}
      disabled={blocked}
      title={blocked ? "Only the owner can release the stop" : on ? "Release the emergency stop" : "Stop every send in the app immediately"}
      aria-label={on ? "Release emergency stop" : "Stop all sends"}
      className={compact ? "px-2.5" : "mt-2.5 w-full"}
    >
      <OctagonX className="size-3.5" aria-hidden />
      <span className={compact ? "hidden sm:inline" : undefined}>{on ? "Release stop" : "Stop all sends"}</span>
    </Button>
  );
}

function StopBanner({ at }: { at: string | null }) {
  const { openStop, me } = useShell();
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-2 border-b border-danger/30 bg-danger/10 px-4 py-2.5 text-[13px] lg:px-10">
      <p className="flex items-center gap-2 text-fg">
        <OctagonX className="size-4 text-danger" aria-hidden />
        <span>
          <b className="font-medium">All sending is stopped</b>
          <span className="text-muted"> since {ago(at)}. Replies wait as drafts until you release the stop.</span>
        </span>
      </p>
      {me.role === "OWNER" && (
        <Button size="xs" variant="secondary" onClick={openStop}>
          Release
        </Button>
      )}
    </div>
  );
}

function EmergencyDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { auto, reloadAuto } = useShell();
  const { busy, run } = useAction();
  const on = !!auto?.emergencyStop;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={on ? "Release the emergency stop?" : "Stop all sending now?"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={on ? "primary" : "danger"}
            data-autofocus
            loading={busy === "stop"}
            onClick={() =>
              run(
                "stop",
                async () => {
                  const r = await post("/api/automation", { action: "emergency_stop", on: !on });
                  onClose();
                  reloadAuto();
                  return r;
                },
                (r: any) => (on ? "Sending is back on. Each chat follows its own setting again." : `Everything is stopped.${r.reverted ? ` ${r.reverted} waiting repl${r.reverted === 1 ? "y is" : "ies are"} back to drafts.` : ""}${r.inFlight ? ` ${r.inFlight} already on its way can't be pulled back.` : ""}`),
              )
            }
          >
            <OctagonX className="size-4" aria-hidden />
            {on ? "Release the stop" : "Stop everything"}
          </Button>
        </>
      }
    >
      {on ? (
        <p className="text-[13px] leading-relaxed text-muted">Sending will follow each conversation's normal setting again. Replies that were held stay as drafts until someone approves them.</p>
      ) : (
        <ul className="space-y-1.5 text-[13px] leading-relaxed text-muted">
          <li>• Nothing can be sent: no automatic replies, no approved drafts, no messages you type.</li>
          <li>• Replies waiting to go out go back to drafts.</li>
          <li>• A message the platform has already received can't be pulled back.</li>
        </ul>
      )}
    </Dialog>
  );
}

function TourButton() {
  const tour = useTour();
  const resumable = !tour.saved.finished && !!tour.saved.stepId;
  return (
    <button type="button" data-tour="help" onClick={() => tour.start()} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-muted hover:bg-panel-2 hover:text-fg">
      <Compass className="size-4 text-faint" aria-hidden />
      {resumable ? "Resume guided tour" : "Guided tour"}
    </button>
  );
}

function SignOut() {
  return (
    <Button
      size="icon-sm"
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
  );
}

function MobileMore() {
  const [open, setOpen] = useState(false);
  const tour = useTour();
  return (
    <div className="relative">
      <Button size="icon" variant="ghost" aria-label="More" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <MoreHorizontal className="size-4" />
      </Button>
      {open && (
        <div className="absolute right-0 top-10 z-50 w-56 animate-pop rounded-xl border border-line-strong bg-panel-2 p-1 shadow-2xl" onMouseLeave={() => setOpen(false)}>
          <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] hover:bg-panel-3" onClick={() => { setOpen(false); tour.start(); }}>
            <Compass className="size-4 text-faint" /> Guided tour
          </button>
          <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] hover:bg-panel-3" onClick={async () => { await post("/api/auth/logout", {}); location.href = "/login"; }}>
            <LogOut className="size-4 text-faint" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function Notifications() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const n = useApi<{ unread: number; items: { id: string; title: string; body: string; link: string | null; readAt: string | null; createdAt: string }[] }>("/api/notifications", { poll: 15000 });
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown", k);
    return () => {
      document.removeEventListener("mousedown", h);
      document.removeEventListener("keydown", k);
    };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <Button size="icon" variant="ghost" aria-label={`Notifications${n.data?.unread ? ` (${n.data.unread} unread)` : ""}`} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Bell className="size-4" />
        {!!n.data?.unread && <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-accent ring-2 ring-bg" aria-hidden />}
      </Button>
      {open && (
        <div className="absolute right-0 top-10 z-50 w-[min(92vw,360px)] animate-pop rounded-xl border border-line-strong bg-panel-2 shadow-2xl lg:left-0 lg:right-auto">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <span className="text-[13px] font-semibold">Notifications</span>
            <Button
              size="xs"
              variant="ghost"
              onClick={async () => {
                await post("/api/notifications", { all: true });
                n.reload();
              }}
            >
              Mark all read
            </Button>
          </div>
          <ul className="max-h-96 overflow-y-auto p-1">
            {n.data?.items.length === 0 && <li className="px-3 py-6 text-center text-[13px] text-muted">You're all caught up.</li>}
            {n.data?.items.map((i) => (
              <li key={i.id}>
                <Link href={fixLink(i.link)} onClick={() => setOpen(false)} className={cn("block rounded-lg px-3 py-2.5 hover:bg-panel-3", !i.readAt && "bg-accent/6")}>
                  <p className="flex items-center gap-1.5 text-[13px] font-medium">
                    {!i.readAt && <span className="size-1.5 rounded-full bg-accent" aria-label="unread" />}
                    {i.title}
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted">{i.body}</p>
                  <p className="mt-1 text-[11px] text-faint">{ago(i.createdAt)}</p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Older notifications may link to pages that moved in the redesign. */
function fixLink(link: string | null) {
  if (!link) return "#";
  return link
    .replace(/^\/handoffs/, "/inbox?filter=needs_you")
    .replace(/^\/automation/, "/settings/automation")
    .replace(/^\/integrations#telegram/, "/settings/notifications")
    .replace(/^\/integrations/, "/settings/accounts")
    .replace(/^\/style/, "/settings/ai");
}
