"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, Compass, Plug, Sparkles } from "lucide-react";
import { Avatar, Badge, buttonVariants, cn, Empty, ErrorBox, Notice, SimBadge, Skeleton, TechDetails } from "@/components/ui";
import { ModelSwitch } from "@/components/model-switch";
import { ago, useApi } from "@/lib/client";
import { useShell } from "@/components/shell";
import { useTour } from "@/components/tour/tour";

export default function HomePage() {
  return <Dashboard />;
}

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? "Good evening" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function Dashboard() {
  const { data, error, reload } = useApi<any>("/api/overview", { poll: 8000 });
  const { me } = useShell();
  if (error && !data) return <div className="mx-auto max-w-5xl"><ErrorBox error={error} retry={reload} /></div>;
  if (!data)
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        <Skeleton className="h-10 w-72" />
        <div className="grid gap-3 md:grid-cols-2">{[0, 1].map((i) => <Skeleton key={i} className="h-44" />)}</div>
        <Skeleton className="h-64" />
      </div>
    );
  const d = data;
  const need = d.attentionTotal;
  const autoOn = d.models.filter((m: any) => m.mode === "AUTO").length;
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header className="animate-rise">
        <h1 className="text-[26px] font-semibold tracking-[-0.025em]">
          {greeting()}
          {me.name && me.name !== "Owner" ? `, ${me.name.split(" ")[0]}` : ""}
        </h1>
        <p className="mt-1 text-[14.5px] text-muted">
          {d.automation.emergencyStop
            ? "All sending is stopped. Nothing goes out until you release the stop."
            : `${autoOn ? `The AI is replying for ${autoOn} of ${d.models.length} model${d.models.length === 1 ? "" : "s"}.` : "The AI is drafting replies for you to approve."} ${need === 0 ? "Nothing needs you right now." : `${need} conversation${need === 1 ? " needs" : "s need"} you.`}`}
        </p>
      </header>

      {!d.worker.running && (
        <Notice tone="warn" title="Your background helper isn't running">
          Replies, timing and alerts wait until it starts. If you run the app yourself, start it again with the usual start command; on a server, restart the “worker” service.
          <TechDetails>
            Worker heartbeat last seen {ago(d.worker.lastSeen)}. Local: <code>npm run worker</code> (or <code>sh scripts/dev-local.sh</code>). Docker: <code>docker compose up -d worker</code>.
          </TechDetails>
        </Notice>
      )}

      <section aria-labelledby="models" data-tour="home-status">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="models" className="text-[15px] font-semibold tracking-[-0.01em]">Your models</h2>
          <Link href="/settings/accounts" className="text-[13px] text-muted hover:text-fg">Add a model</Link>
        </div>
        {d.models.length === 0 && (
          <Empty title="No models connected yet" action={<Link href="/settings/accounts" className={buttonVariants({ variant: "primary" })}>Connect an account</Link>}>
            Connect a creator account to start. Each model gets her own AI personality, PPV menu and auto-reply switch.
          </Empty>
        )}
        <div className="grid gap-3 md:grid-cols-2">
          {d.models.map((m: any, i: number) => (
            <ModelCard key={m.id} m={m} reload={reload} tourTarget={i === 0 ? "model-switch" : undefined} />
          ))}
        </div>
        <AiEngineLine ai={d.status.ai} />
      </section>

      <section aria-labelledby="needs-you">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="needs-you" className="text-[15px] font-semibold tracking-[-0.01em]">Needs you</h2>
          {need > 0 && <Link href="/inbox?filter=needs_you" className="text-[13px] text-muted hover:text-fg">View all</Link>}
        </div>
        {d.attention.length === 0 ? (
          <div className="flex items-center gap-3 rounded-xl border border-line bg-panel px-5 py-5">
            <CheckCircle2 className="size-5 text-ok" aria-hidden />
            <p className="text-[13.5px] text-muted">All clear. When a subscriber needs a person, or a reply is waiting for your approval, it shows up here.</p>
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
                      <span className="truncate text-xs font-normal text-faint">· {a.model}</span>
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
    </div>
  );
}

function ModelCard({ m, reload, tourTarget }: { m: any; reload: () => void; tourTarget?: string }) {
  const conn = m.isSimulated ? { dot: "bg-faint", text: "Practice account" } : m.connectionStatus === "CONNECTED" ? { dot: "bg-ok", text: "Connected" } : { dot: "bg-danger", text: "Needs reconnecting" };
  const TONE: Record<string, string> = { warm: "Friendly", playful: "Playful", confident: "Confident", professional: "Professional", concise: "Short & sweet" };
  return (
    <div className="rounded-2xl border border-line bg-panel p-4 transition-colors hover:border-line-strong">
      <div className="flex items-start gap-3">
        <Avatar name={m.name} size={44} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.01em]">
            <span className="truncate">{m.name.replace(/ \((Demo|Practice)\)$/, "")}</span>
            {m.isSimulated && <SimBadge />}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
            <span className={cn("size-1.5 rounded-full", conn.dot)} aria-hidden />
            {conn.text}
            {m.tone && <span className="text-faint">· {TONE[m.tone] ?? m.tone} personality</span>}
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <ModelSwitch accountId={m.id} name={m.name.replace(/ \((Demo|Practice)\)$/, "")} mode={m.mode} isSimulated={m.isSimulated} onChange={reload} size="sm" tourTarget={tourTarget} />
        <span className="text-xs text-faint">{m.mode === "AUTO" ? "Replies by itself" : m.mode === "DRAFT" ? "You approve replies" : "AI is off"}</span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-3 text-center">
        <MiniCount label="Chats" value={m.chats} />
        <MiniCount label="Needs you" value={m.needsYou + m.drafts} tone={m.needsYou + m.drafts ? "warn" : undefined} />
        <MiniCount label="Sending soon" value={m.queued} />
      </div>
      <div className="mt-3 flex gap-2">
        <Link href={`/inbox?model=${m.id}`} className="flex-1 rounded-lg bg-panel-2 px-3 py-2 text-center text-[13px] font-medium hover:bg-panel-3">Open chats</Link>
        <Link href={`/settings/ai?model=${m.id}`} className="flex-1 rounded-lg bg-panel-2 px-3 py-2 text-center text-[13px] font-medium hover:bg-panel-3">Personality</Link>
      </div>
    </div>
  );
}

function MiniCount({ label, value, tone }: { label: string; value: number; tone?: "warn" }) {
  return (
    <div>
      <p className={cn("text-[18px] font-semibold tabular-nums", tone === "warn" && "text-warn")}>{value}</p>
      <p className="text-[11px] text-faint">{label}</p>
    </div>
  );
}

function AiEngineLine({ ai }: { ai: any }) {
  const t =
    ai.kind === "connected"
      ? { dot: "bg-ok", text: `Replies are written by your connected AI model (${ai.model}).`, cta: "AI settings", href: "/settings/ai#connection" }
      : ai.kind === "needs_test"
        ? { dot: "bg-warn", text: "Your AI connection changed and needs a quick test before it writes replies.", cta: "Run test", href: "/settings/ai#connection" }
        : { dot: "bg-faint", text: "Replies are written by built-in sample rules. Connect an AI model for natural, personal replies.", cta: "Connect AI", href: "/settings/ai#connection" };
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-panel/60 px-4 py-2.5 text-[13px]">
      <Sparkles className="size-4 text-accent" aria-hidden />
      <span className={cn("size-1.5 rounded-full", t.dot)} aria-hidden />
      <span className="flex-1 text-muted">{t.text}</span>
      <Link href={t.href} className="inline-flex items-center gap-1 font-medium text-accent hover:text-accent-strong">
        {t.cta} <ArrowRight className="size-3.5" />
      </Link>
    </div>
  );
}
