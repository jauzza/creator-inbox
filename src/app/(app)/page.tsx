"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Bot, CheckCircle2, Circle, Clock, Compass, Inbox, MessageSquare, Plug, Send, Sparkles } from "lucide-react";
import { Avatar, Badge, Card, cn, ErrorBox, Notice, SimBadge, Skeleton, TechDetails } from "@/components/ui";
import { ago, useApi } from "@/lib/client";
import { useShell } from "@/components/shell";
import { useTour } from "@/components/tour/tour";

export default function HomePage() {
  const [welcome, setWelcome] = useState<boolean | null>(null);
  const tour = useTour();
  useEffect(() => setWelcome(localStorage.getItem("ci.welcome.done") !== "1"), []);
  if (welcome === null) return null;
  if (welcome && !tour.active)
    return (
      <Welcome
        onDemo={() => {
          localStorage.setItem("ci.welcome.done", "1");
          setWelcome(false);
          tour.start({ restart: true });
        }}
        onSkip={() => {
          localStorage.setItem("ci.welcome.done", "1");
          setWelcome(false);
        }}
      />
    );
  return <Dashboard />;
}

function Welcome({ onDemo, onSkip }: { onDemo: () => void; onSkip: () => void }) {
  const { me } = useShell();
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-10rem)] max-w-3xl flex-col justify-center py-8">
      <div className="animate-rise">
        <p className="text-[13px] font-medium text-accent">Welcome{me.name && me.name !== "Owner" ? `, ${me.name}` : ""} 👋</p>
        <h1 className="mt-2 text-[34px] font-semibold leading-[1.1] tracking-[-0.03em] sm:text-[42px]">
          All your fan messages.
          <br />
          <span className="text-muted">One calm inbox.</span>
        </h1>
        <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted">
          Your AI assistant drafts friendly replies in your own style. You decide what gets sent: approve with one click, edit, or take over whenever you like.
        </p>
      </div>
      <div className="mt-9 grid animate-rise gap-3 [animation-delay:80ms] sm:grid-cols-2">
        <button type="button" onClick={onDemo} className="group surface-glow rounded-2xl border border-accent/40 p-5 text-left transition-all hover:border-accent hover:shadow-[0_12px_40px_-16px_var(--color-accent)]">
          <span className="flex size-10 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <Compass className="size-5" aria-hidden />
          </span>
          <p className="mt-4 text-[16px] font-semibold">Explore with a demo</p>
          <p className="mt-1 text-[13.5px] leading-relaxed text-muted">A 3-minute interactive tour. Watch a test message arrive and see your AI reply. No keys or setup needed.</p>
          <p className="mt-4 flex items-center gap-1 text-[13px] font-medium text-accent">
            Start the tour <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
          </p>
        </button>
        <Link href="/setup" onClick={() => localStorage.setItem("ci.welcome.done", "1")} className="group rounded-2xl border border-line bg-panel p-5 transition-all hover:border-line-strong hover:bg-panel-2">
          <span className="flex size-10 items-center justify-center rounded-xl bg-panel-3 text-fg">
            <Plug className="size-5" aria-hidden />
          </span>
          <p className="mt-4 text-[16px] font-semibold">Set up my account</p>
          <p className="mt-1 text-[13.5px] leading-relaxed text-muted">Connect your messaging account and AI, test a reply, and choose how much the AI may do. About 10 minutes.</p>
          <p className="mt-4 flex items-center gap-1 text-[13px] font-medium text-fg">
            Get started <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
          </p>
        </Link>
      </div>
      <button type="button" onClick={onSkip} className="mt-6 self-start text-[13px] text-faint hover:text-muted">
        Skip for now, take me to my dashboard
      </button>
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? "Good evening" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function Dashboard() {
  const { data, error, reload } = useApi<any>("/api/overview", { poll: 10000 });
  const onboarding = useApi<any>("/api/onboarding", { poll: 30000 });
  const { me } = useShell();
  if (error && !data) return <div className="mx-auto max-w-5xl"><ErrorBox error={error} retry={reload} /></div>;
  if (!data)
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        <Skeleton className="h-10 w-72" />
        <div className="grid gap-3 md:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-32" />)}</div>
        <Skeleton className="h-64" />
      </div>
    );
  const d = data;
  const need = d.attentionTotal;
  const sim = d.today.simulated;
  const hasLive = d.status.messaging.liveAccounts > 0;
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header className="animate-rise">
        <h1 className="text-[26px] font-semibold tracking-[-0.025em]">
          {greeting()}
          {me.name && me.name !== "Owner" ? `, ${me.name.split(" ")[0]}` : ""}
        </h1>
        <p className="mt-1 text-[14.5px] text-muted">
          {need === 0 ? "Nothing needs you right now. Your inbox is under control." : `${need} conversation${need === 1 ? " needs" : "s need"} your attention.`}
        </p>
      </header>

      {!d.worker.running && (
        <Notice tone="warn" title="Your background helper isn't running">
          Drafts, scheduled replies and alerts are waiting until it starts. If you run the app yourself, start it again with the usual start command; on a server, restart the “worker” service.
          <TechDetails>
            Worker heartbeat last seen {ago(d.worker.lastSeen)}. Local: <code>npm run worker</code> (or <code>sh scripts/dev-local.sh</code>). Docker: <code>docker compose up -d worker</code>.
          </TechDetails>
        </Notice>
      )}

      <StatusCards d={d} />

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <section aria-labelledby="needs-you" className="min-w-0">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="needs-you" className="text-[15px] font-semibold tracking-[-0.01em]">
              Needs you
            </h2>
            {need > 0 && (
              <Link href="/inbox?filter=needs_you" className="text-[13px] text-muted hover:text-fg">
                View all
              </Link>
            )}
          </div>
          {d.attention.length === 0 ? (
            <div className="flex items-center gap-3 rounded-xl border border-line bg-panel px-5 py-6">
              <CheckCircle2 className="size-5 text-ok" aria-hidden />
              <div>
                <p className="text-[14px] font-medium">All clear</p>
                <p className="text-[13px] text-muted">When a customer needs a person, or a reply is waiting for approval, it shows up here.</p>
              </div>
            </div>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-panel">
              {d.attention.map((a: any) => (
                <li key={a.conversationId}>
                  <Link href={`/inbox?c=${a.conversationId}`} className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-panel-2">
                    <Avatar name={a.customer} size={34} />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 text-[14px] font-medium">
                        <span className="truncate">{a.customer}</span>
                        {a.isSimulated && <SimBadge />}
                      </p>
                      <p className="truncate text-[13px] text-muted">{a.reason}</p>
                    </div>
                    <Badge tone={a.kind === "draft" ? "accent" : a.kind === "uncertain" ? "danger" : "warn"}>{a.kind === "draft" ? "Draft ready" : a.kind === "uncertain" ? "Check delivery" : "Needs you"}</Badge>
                    <span className="hidden w-16 text-right text-xs text-faint sm:block">{ago(a.at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="space-y-6">
          <section aria-labelledby="today">
            <h2 id="today" className="mb-3 text-[15px] font-semibold tracking-[-0.01em]">
              Today
            </h2>
            <div className="grid grid-cols-2 gap-2.5">
              <MiniStat icon={<MessageSquare className="size-3.5" />} label="Messages in" value={hasLive ? d.today.real.received : sim.received} demo={!hasLive} />
              <MiniStat icon={<Send className="size-3.5" />} label="Replies sent" value={hasLive ? d.today.real.sent : sim.sent} demo={!hasLive} />
              <MiniStat icon={<Bot className="size-3.5" />} label="AI is helping with" value={d.aiHelping} suffix="chats" />
              <MiniStat icon={<Clock className="size-3.5" />} label="Drafts waiting" value={d.counts.proposed} />
            </div>
            {!hasLive && <p className="mt-2 text-[11.5px] text-faint">Message counts are from demo conversations. Your real numbers appear once you connect an account.</p>}
            <Link href="/insights" className="mt-3 inline-flex items-center gap-1 text-[13px] text-muted hover:text-fg">
              Full report <ArrowRight className="size-3.5" />
            </Link>
          </section>
          {onboarding.data && <SetupProgress steps={onboarding.data.steps} status={d.status} />}
        </aside>
      </div>
    </div>
  );
}

function StatusCards({ d }: { d: any }) {
  const m = d.status.messaging;
  const ai = d.status.ai;
  const a = d.automation;
  const msg = m.liveAccounts === 0
    ? { tone: "neutral", title: "Demo mode", text: "You're exploring with demo customers. Connect your account to see real messages.", href: "/setup", cta: "Connect account" }
    : m.problems.length
      ? { tone: "danger", title: "Connection needs attention", text: `We couldn't reach ${m.problems[0].name}. Reconnect it to keep messages flowing.`, href: "/settings/accounts", cta: "Fix connection", tech: m.problems.map((p: any) => `${p.name}: ${p.status}${p.detail ? ` (${p.detail})` : ""}`).join("; ") }
      : { tone: "ok", title: "Messages are flowing", text: `${m.connected} account${m.connected === 1 ? "" : "s"} connected.`, href: "/settings/accounts", cta: "Manage" };
  const aiCard = ai.kind === "connected"
    ? { tone: "ok", title: "AI is ready", text: "Your connected AI model writes the drafts.", href: "/settings/ai", cta: "Customize" }
    : ai.kind === "needs_test"
      ? { tone: "warn", title: "AI needs a quick test", text: "Your AI connection changed. Run the test so it can write replies again.", href: "/settings/ai#connection", cta: "Run test" }
      : { tone: "neutral", title: "Using sample replies", text: "Built-in example rules write the drafts. Connect an AI model for natural replies.", href: "/setup?step=ai", cta: "Connect AI" };
  const autoCard = a.emergencyStop
    ? { tone: "danger", title: "Sending is stopped", text: "Nothing will be sent until you release the stop.", href: "/settings/automation", cta: "Review" }
    : a.globalMode === "AUTO"
      ? { tone: "ok", title: "Automatic replies on", text: "Simple, safe replies may send by themselves. Everything else waits for you.", href: "/settings/automation", cta: "Change" }
      : a.globalMode === "PAUSED"
        ? { tone: "warn", title: "AI is switched off", text: "No drafts or automatic replies are being written.", href: "/settings/automation", cta: "Turn on" }
        : { tone: "accent", title: "Drafts only", text: "The AI writes drafts. Nothing is sent until you approve it.", href: "/settings/automation", cta: "Change" };
  return (
    <div data-tour="home-status" className="grid gap-3 md:grid-cols-3">
      <StatusCard icon={<Inbox className="size-4" />} label="Inbox" {...msg} />
      <StatusCard icon={<Sparkles className="size-4" />} label="AI assistant" {...aiCard} />
      <StatusCard icon={<Bot className="size-4" />} label="Automation" {...autoCard} />
    </div>
  );
}

function StatusCard({ icon, label, tone, title, text, href, cta, tech }: { icon: React.ReactNode; label: string; tone: string; title: string; text: string; href: string; cta: string; tech?: string }) {
  const dot = { ok: "bg-ok", warn: "bg-warn", danger: "bg-danger", accent: "bg-accent", neutral: "bg-faint" }[tone];
  return (
    <div className="flex flex-col rounded-xl border border-line bg-panel p-4 transition-colors hover:border-line-strong">
      <p className="flex items-center gap-2 text-xs font-medium text-faint">
        {icon}
        {label}
      </p>
      <p className="mt-3 flex items-center gap-2 text-[14.5px] font-semibold">
        <span className={cn("size-2 rounded-full", dot, tone === "ok" && "shadow-[0_0_10px_var(--color-ok)]")} aria-hidden />
        {title}
      </p>
      <p className="mt-1 flex-1 text-[13px] leading-relaxed text-muted">{text}</p>
      {tech && <TechDetails>{tech}</TechDetails>}
      <Link href={href} className="mt-3 inline-flex items-center gap-1 self-start text-[13px] font-medium text-accent hover:text-accent-strong">
        {cta} <ArrowRight className="size-3.5" />
      </Link>
    </div>
  );
}

function MiniStat({ icon, label, value, suffix, demo }: { icon: React.ReactNode; label: string; value: number; suffix?: string; demo?: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-panel px-3.5 py-3">
      <p className="flex items-center gap-1.5 text-[11.5px] text-faint">
        {icon}
        {label}
      </p>
      <p className="mt-1.5 flex items-baseline gap-1.5">
        <span className="text-[22px] font-semibold leading-none tracking-[-0.02em] tabular-nums">{value}</span>
        {suffix && <span className="text-xs text-faint">{suffix}</span>}
        {demo && <span className="text-[10px] font-medium uppercase tracking-wide text-info">demo</span>}
      </p>
    </div>
  );
}

function SetupProgress({ steps, status }: { steps: Record<string, boolean>; status: any }) {
  const tour = useTour();
  const items = [
    { done: tour.saved.finished || tour.saved.completed.length > 8, label: "Take the guided tour", action: () => tour.start() },
    { done: status.messaging.connected > 0, label: "Connect your messaging account", href: "/setup" },
    { done: status.ai.kind === "connected", label: "Connect an AI model", href: "/setup?step=ai", optional: true },
    { done: !!steps.style, label: "Give your AI a personality", href: "/settings/ai" },
    { done: !!steps.approve, label: "Approve your first reply", href: "/inbox" },
  ];
  const done = items.filter((i) => i.done).length;
  if (done === items.length) return null;
  return (
    <Card padded={false} className="overflow-hidden">
      <div className="px-4 pt-4">
        <p className="text-[14px] font-semibold">Get set up</p>
        <p className="text-xs text-muted">
          {done} of {items.length} done
        </p>
        <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-panel-3" aria-hidden>
          <div className="h-full rounded-full bg-accent transition-all duration-700" style={{ width: `${(done / items.length) * 100}%` }} />
        </div>
      </div>
      <ul className="p-2">
        {items.map((i) => {
          const inner = (
            <>
              {i.done ? <CheckCircle2 className="size-4 shrink-0 text-ok" aria-label="done" /> : <Circle className="size-4 shrink-0 text-faint" aria-label="to do" />}
              <span className={cn("flex-1", i.done && "text-faint line-through")}>{i.label}</span>
              {i.optional && !i.done && <span className="text-[11px] text-faint">Optional</span>}
            </>
          );
          return (
            <li key={i.label}>
              {i.href ? (
                <Link href={i.href} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] hover:bg-panel-2">
                  {inner}
                </Link>
              ) : (
                <button type="button" onClick={i.action} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] hover:bg-panel-2">
                  {inner}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
