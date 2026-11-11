"use client";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Bot, Check, MessageSquare, PartyPopper, PenLine, Sparkles, Wand2 } from "lucide-react";
import { Avatar, Button, buttonVariants, Card, cn, Dialog, Skeleton, useAction } from "@/components/ui";
import { humanize, post, useApi } from "@/lib/client";
import { MessagingConnect } from "@/components/settings/messaging-connect";
import { AiConnection } from "@/components/settings/ai-connection";
import { useShell } from "@/components/shell";

const STEPS = [
  { id: "messaging", label: "Messaging", icon: MessageSquare },
  { id: "ai", label: "AI", icon: Sparkles },
  { id: "test", label: "Test a reply", icon: Wand2 },
  { id: "mode", label: "Automation", icon: Bot },
] as const;
type StepId = (typeof STEPS)[number]["id"] | "done";

export default function SetupPage() {
  return (
    <Suspense>
      <Setup />
    </Suspense>
  );
}

function Setup() {
  const sp = useSearchParams();
  const router = useRouter();
  const [step, setStep] = useState<StepId>((sp.get("step") as StepId) ?? "messaging");
  useEffect(() => {
    const s = sp.get("step") as StepId | null;
    if (s) setStep(s);
  }, [sp]);
  const integ = useApi<any>("/api/integrations");
  const go = (s: StepId) => {
    setStep(s);
    router.replace(`/setup?step=${s}`, { scroll: false });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const idx = STEPS.findIndex((s) => s.id === step);
  const next = () => go(idx < STEPS.length - 1 ? STEPS[idx + 1].id : "done");

  const d = integ.data;
  const live = d?.accounts.filter((a: any) => !a.isSimulated) ?? [];
  const doneMap: Record<string, boolean> = {
    messaging: live.some((a: any) => a.connectionStatus === "CONNECTED"),
    ai: d ? d.ai.settings.provider !== "offline" && d.ai.settings.verifiedModel === d.ai.settings.replyModel : false,
    test: false,
    mode: false,
  };

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-8">
        <Link href="/" className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-fg">
          <ArrowLeft className="size-3.5" /> Back to Home
        </Link>
        <h1 className="mt-3 text-[26px] font-semibold tracking-[-0.025em]">Set up your account</h1>
        <p className="mt-1 text-[14.5px] text-muted">Four short steps. Skip anything and come back later. The demo keeps working while you set up.</p>
      </div>

      {step !== "done" && (
        <ol className="mb-8 grid grid-cols-4 gap-2" aria-label="Setup steps">
          {STEPS.map((s, i) => {
            const current = s.id === step;
            const done = doneMap[s.id] || i < idx;
            return (
              <li key={s.id}>
                <button type="button" onClick={() => go(s.id)} aria-current={current ? "step" : undefined} className="group w-full text-left">
                  <span className={cn("block h-1 rounded-full transition-colors", current ? "bg-accent" : done ? "bg-accent/45" : "bg-panel-3")} />
                  <span className={cn("mt-2 flex items-center gap-1.5 text-[12.5px] font-medium", current ? "text-fg" : "text-faint group-hover:text-muted")}>
                    {doneMap[s.id] ? <Check className="size-3.5 text-ok" aria-label="done" /> : <s.icon className="size-3.5" aria-hidden />}
                    <span className="hidden sm:inline">{s.label}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}

      {!d ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : (
        <div key={step} className="animate-rise">
          {step === "messaging" && (
            <StepCard title="Connect your messaging account" text="This is where your customer messages come from. You'll need a Fans API account; it takes a few minutes." onNext={next} nextLabel={doneMap.messaging ? "Continue" : "Skip for now"} nextPrimary={doneMap.messaging}>
              <MessagingConnect d={d} reload={integ.reload} />
            </StepCard>
          )}
          {step === "ai" && (
            <StepCard title="Connect your AI" text="Pick what writes your drafts. Sample replies work right away for free; a real AI model writes much more natural replies." onBack={() => go("messaging")} onNext={next} nextLabel={doneMap.ai ? "Continue" : "Continue with sample replies"} nextPrimary={doneMap.ai}>
              <AiConnection d={d} reload={integ.reload} />
            </StepCard>
          )}
          {step === "test" && (
            <StepCard title="Test a reply" text="See how your AI answers a typical first message. Nothing is sent to anyone." onBack={() => go("ai")} onNext={next} nextLabel="Looks good" nextPrimary>
              <TestReply sample={d.ai.settings.provider === "offline"} />
            </StepCard>
          )}
          {step === "mode" && <ModeStep onBack={() => go("test")} onDone={() => go("done")} />}
          {step === "done" && <Done doneMap={doneMap} />}
        </div>
      )}
    </div>
  );
}

function StepCard({ title, text, children, onBack, onNext, nextLabel, nextPrimary }: { title: string; text: string; children: React.ReactNode; onBack?: () => void; onNext: () => void; nextLabel: string; nextPrimary?: boolean }) {
  return (
    <Card padded={false}>
      <div className="border-b border-line px-6 py-5">
        <h2 className="text-[17px] font-semibold tracking-[-0.015em]">{title}</h2>
        <p className="mt-1 text-[13.5px] leading-relaxed text-muted">{text}</p>
      </div>
      <div className="px-6 py-6">{children}</div>
      <div className="flex items-center justify-between border-t border-line px-6 py-4">
        {onBack ? <Button variant="ghost" onClick={onBack}><ArrowLeft className="size-3.5" /> Back</Button> : <span />}
        <Button variant={nextPrimary ? "primary" : "secondary"} onClick={onNext}>
          {nextLabel} <ArrowRight className="size-3.5" />
        </Button>
      </div>
    </Card>
  );
}

function TestReply({ sample }: { sample: boolean }) {
  const style = useApi<any>("/api/style");
  const [res, setRes] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const { busy, run } = useAction();
  const msg = "Hey! I'm new here. What kind of content do you offer?";
  const go = () =>
    run("t", async () => {
      setErr(null);
      try {
        setRes(await post("/api/style", { action: "preview", accountId: style.data.account.id, data: style.data.active.data, conversation: [{ direction: "INBOUND", body: msg }] }));
      } catch (e) {
        setErr(humanize(e instanceof Error ? e.message : String(e)).message);
      }
    });
  useEffect(() => {
    if (style.data && !res) go();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [style.data]);
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-bg/50 p-5">
        <div className="flex items-end gap-2">
          <Avatar name="Taylor" size={28} />
          <div className="max-w-[80%] rounded-2xl rounded-bl-md bg-panel-3 px-3.5 py-2 text-[14px]">{msg}</div>
        </div>
        <div className="mt-4 flex flex-col items-end">
          <p className="mb-1.5 text-[11.5px] text-faint">{res ? (res.isSample ? "Sample reply · built-in rules" : `Your AI · ${res.model}`) : "Writing…"}</p>
          {res?.output?.reply ? (
            <div className="max-w-[85%] animate-pop rounded-2xl rounded-br-md bg-accent px-3.5 py-2 text-[14px] text-accent-ink">{res.output.reply}</div>
          ) : err ? (
            <p className="text-[13px] text-danger">{err}</p>
          ) : (
            <div className="w-3/5 space-y-2 rounded-2xl bg-accent/10 px-3.5 py-3"><div className="skeleton h-2.5 rounded-full" /><div className="skeleton h-2.5 w-2/3 rounded-full" /></div>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={go} loading={busy === "t"}>Write another version</Button>
        <Link href="/settings/ai" className="text-[13px] font-medium text-accent hover:text-accent-strong">Change how your AI sounds →</Link>
      </div>
      {sample && <p className="text-xs text-faint">This is a sample reply written by built-in rules. Connect an AI model in the previous step for natural, personal replies.</p>}
    </div>
  );
}

function ModeStep({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const { auto, reloadAuto, me } = useShell();
  const { busy, run } = useAction();
  const [confirm, setConfirm] = useState(false);
  const [pick, setPick] = useState<"DRAFT" | "AUTO" | "PAUSED">((auto?.globalMode as any) === "AUTO" ? "AUTO" : (auto?.globalMode as any) === "PAUSED" ? "PAUSED" : "DRAFT");
  const apply = (confirmed?: boolean) =>
    run("m", async () => {
      if (pick !== auto?.globalMode) await post("/api/automation", { action: "global_mode", mode: pick, confirm: confirmed });
      reloadAuto();
      onDone();
    });
  const opts = [
    { m: "DRAFT" as const, title: "Drafts only", text: "The AI writes, you approve every reply. Best for getting started.", icon: PenLine, tag: "Recommended" },
    { m: "AUTO" as const, title: "Automatic", text: "Simple, safe replies may send by themselves. Sensitive ones still wait for you.", icon: Bot },
    { m: "PAUSED" as const, title: "Off for now", text: "No AI drafts. You write every reply yourself.", icon: Sparkles },
  ];
  return (
    <StepCard title="How much should the AI do?" text="You can change this any time, and override it for single conversations." onBack={onBack} onNext={() => (pick === "AUTO" && auto?.globalMode !== "AUTO" ? setConfirm(true) : apply())} nextLabel={busy === "m" ? "Saving…" : "Finish setup"} nextPrimary>
      <div role="radiogroup" aria-label="AI mode" className="grid gap-2.5">
        {opts.map((o) => (
          <button key={o.m} type="button" role="radio" aria-checked={pick === o.m} disabled={me.role !== "OWNER"} onClick={() => setPick(o.m)} className={cn("flex items-start gap-3 rounded-xl border p-4 text-left transition-all", pick === o.m ? "border-accent bg-accent/8 ring-1 ring-accent/40" : "border-line hover:border-line-strong")}>
            <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", pick === o.m ? "bg-accent/20 text-accent" : "bg-panel-3 text-muted")}><o.icon className="size-4" /></span>
            <span className="flex-1">
              <span className="flex items-center justify-between text-[14px] font-medium">{o.title}{o.tag && <span className="text-[11px] font-normal text-faint">{o.tag}</span>}</span>
              <span className="mt-0.5 block text-[13px] text-muted">{o.text}</span>
            </span>
          </button>
        ))}
      </div>
      <Dialog open={confirm} onClose={() => setConfirm(false)} title="Turn on automatic replies?" footer={<><Button variant="ghost" onClick={() => setConfirm(false)}>Cancel</Button><Button variant="primary" onClick={() => { setConfirm(false); apply(true); }}>Turn on</Button></>}>
        <p className="text-[13px] leading-relaxed text-muted">Only simple replies that pass every safety check go out by themselves, within your timing and hours. Explicit requests, billing, complaints, safety issues and requests for a real person always wait for you. Every AI-written message carries your AI disclosure.</p>
      </Dialog>
    </StepCard>
  );
}

function Done({ doneMap }: { doneMap: Record<string, boolean> }) {
  return (
    <Card className="surface-glow text-center">
      <div className="py-8">
        <span className="mx-auto flex size-14 animate-pop items-center justify-center rounded-2xl bg-accent/15 text-accent">
          <PartyPopper className="size-7" aria-hidden />
        </span>
        <h2 className="mt-5 text-[22px] font-semibold tracking-[-0.02em]">You're all set</h2>
        <p className="mx-auto mt-2 max-w-md text-[14px] text-muted">
          {doneMap.messaging ? "New customer messages will appear in your inbox." : "You can connect your messaging account any time in Settings. Meanwhile, the demo customers are waiting in your inbox."}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link href="/inbox" className={buttonVariants({ variant: "primary", size: "lg" })}>Open my inbox <ArrowRight className="size-4" /></Link>
          <Link href="/settings/ai" className={buttonVariants({ size: "lg" })}>Personalize my AI</Link>
        </div>
      </div>
    </Card>
  );
}
