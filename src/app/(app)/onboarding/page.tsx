"use client";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Bot, Check, KeyRound, MessageSquare, PartyPopper, Sparkles, Video, Wand2 } from "lucide-react";
import { Avatar, Button, Card, cn, ErrorBox, Field, Input, Notice, Segmented, Skeleton, Switch, useAction } from "@/components/ui";
import { post, useApi } from "@/lib/client";
import { useShell } from "@/components/shell";
import { MessagingConnect } from "@/components/settings/messaging-connect";
import { AiConnection } from "@/components/settings/ai-connection";
import { PpvMenu } from "@/components/settings/ppv-menu";
import { ModelSwitch } from "@/components/model-switch";
import { ListEditor, ChipEditor, PRESETS, type StyleData } from "@/components/settings/personality-bits";

/**
 * Mandatory first-run setup. The owner connects real creator accounts, the AI, each model's personality
 * and PPV menu, and chooses how much the AI may do. Nothing here uses demo data.
 */
const STEPS = [
  { id: "welcome", label: "Welcome", icon: Sparkles },
  { id: "connect", label: "Accounts", icon: MessageSquare },
  { id: "ai", label: "AI", icon: KeyRound },
  { id: "personality", label: "Personality", icon: Wand2 },
  { id: "ppv", label: "PPV menu", icon: Video },
  { id: "automation", label: "Automation", icon: Bot },
  { id: "done", label: "Finish", icon: Check },
] as const;
type StepId = (typeof STEPS)[number]["id"];
const KEY = "ci.onboarding.step";

export default function OnboardingPage() {
  const { me } = useShell();
  const status = useApi<any>("/api/onboarding");
  const integ = useApi<any>(me.role === "OWNER" ? "/api/integrations" : null);
  const [step, setStep] = useState<StepId>("welcome");
  useEffect(() => {
    const s = localStorage.getItem(KEY) as StepId | null;
    if (s && STEPS.some((x) => x.id === s)) setStep(s);
  }, []);
  const go = (s: StepId) => {
    setStep(s);
    localStorage.setItem(KEY, s);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const idx = STEPS.findIndex((s) => s.id === step);
  const next = () => go(STEPS[Math.min(idx + 1, STEPS.length - 1)].id);
  const back = () => go(STEPS[Math.max(idx - 1, 0)].id);
  const reload = () => {
    status.reload();
    integ.reload();
  };

  if (status.error && !status.data) return <div className="mx-auto max-w-2xl"><ErrorBox error={status.error} retry={status.reload} /></div>;
  if (!status.data || (me.role === "OWNER" && !integ.data)) return <div className="mx-auto max-w-2xl space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-80 rounded-xl" /></div>;

  if (me.role !== "OWNER") return <TeamMemberSetup s={status.data} />;

  const s = status.data.setup;
  const connected = s.models.filter((m: any) => m.connected);

  return (
    <div className="mx-auto max-w-2xl">
      <ol className="mb-8 flex gap-1.5" aria-label="Setup progress">
        {STEPS.map((x, i) => (
          <li key={x.id} className="flex-1" aria-current={x.id === step ? "step" : undefined}>
            <span className={cn("block h-1 rounded-full transition-colors", i < idx ? "bg-fg/60" : i === idx ? "bg-fg" : "bg-panel-3")} />
            <span className={cn("mt-2 hidden text-[11.5px] font-medium sm:block", i === idx ? "text-fg" : "text-faint")}>{x.label}</span>
          </li>
        ))}
      </ol>
      <p className="mb-1 text-xs font-medium text-faint sm:hidden">Step {idx + 1} of {STEPS.length} · {STEPS[idx].label}</p>

      <div key={step} className="animate-rise">
        {step === "welcome" && (
          <Shell
            title="Let's set up your inbox"
            text="About 15 minutes. You'll connect your creators' accounts, connect the AI, and give each model her own voice. You can come back to any step later."
            next={{ label: "Get started", onClick: next }}
          >
            <ul className="space-y-3 text-[13.5px]">
              {[
                ["A Fans API account and its API key", "This is how the app reads and sends messages. The creators log in on Fans API's side; this app never sees their passwords."],
                ["A DeepSeek API key (recommended)", "This is the AI that writes the replies. Without it, the app uses basic sample replies."],
                ["What each model sells", "Titles and prices of her PPV videos or sets, so the AI can mention them accurately."],
              ].map(([t, d]) => (
                <li key={t} className="flex gap-3">
                  <Check className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
                  <span>
                    <span className="block font-medium">{t}</span>
                    <span className="text-muted">{d}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Shell>
        )}

        {step === "connect" && (
          <Shell
            title="Connect your creator accounts"
            text="Add every model you manage. Required: at least one connected account."
            back={back}
            next={{ label: connected.length ? `Continue with ${connected.length} account${connected.length === 1 ? "" : "s"}` : "Connect an account to continue", onClick: next, disabled: connected.length === 0 }}
          >
            <MessagingConnect d={integ.data} reload={reload} />
            {connected.length > 0 && (
              <div className="mt-6 border-t border-line pt-5">
                <p className="mb-2 text-xs font-medium text-faint">Connected</p>
                <ul className="flex flex-wrap gap-2">
                  {connected.map((m: any) => (
                    <li key={m.id} className="flex items-center gap-2 rounded-lg border border-line-strong py-1 pl-1 pr-3 text-[13px]">
                      <Avatar name={m.name} size={24} /> {m.name}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Shell>
        )}

        {step === "ai" && <AiStep s={s} integ={integ.data} reload={reload} back={back} next={next} />}

        {step === "personality" && (
          <Shell title="Give each model her voice" text="Pick a starting personality and add a few true facts about her. You can fine-tune everything later in Settings." back={back} next={{ label: "Continue", onClick: next }}>
            <PerModel models={connected}>{(m) => <QuickPersonality key={m.id} accountId={m.id} onSaved={reload} />}</PerModel>
          </Shell>
        )}

        {step === "ppv" && (
          <Shell title="What does each model sell?" text="Optional now, but the AI can only mention PPV items listed here, at these exact prices." back={back} next={{ label: connected.some((m: any) => m.ppvItems === 0) ? "Skip for now" : "Continue", onClick: next, quiet: connected.some((m: any) => m.ppvItems === 0) }}>
            <PerModel models={connected}>{(m) => <PpvMenu key={m.id} accountId={m.id} />}</PerModel>
          </Shell>
        )}

        {step === "automation" && <AutomationStep models={connected} back={back} next={next} />}

        {step === "done" && <DoneStep s={s} back={back} />}
      </div>
    </div>
  );
}

function Shell({ title, text, children, back, next }: { title: string; text: string; children: React.ReactNode; back?: () => void; next?: { label: string; onClick: () => void; disabled?: boolean; quiet?: boolean; loading?: boolean } }) {
  return (
    <Card padded={false}>
      <div className="px-5 pb-2 pt-6 sm:px-7">
        <h1 className="text-[20px] font-semibold tracking-[-0.02em]">{title}</h1>
        <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{text}</p>
      </div>
      <div className="px-5 py-5 sm:px-7">{children}</div>
      <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-4 sm:px-7">
        {back ? (
          <Button variant="ghost" onClick={back}>
            <ArrowLeft className="size-4" /> Back
          </Button>
        ) : (
          <span />
        )}
        {next && (
          <Button variant={next.quiet ? "outline" : "primary"} onClick={next.onClick} disabled={next.disabled} loading={next.loading}>
            {next.label} {!next.disabled && <ArrowRight className="size-4" />}
          </Button>
        )}
      </div>
    </Card>
  );
}

function PerModel({ models, children }: { models: any[]; children: (m: any) => React.ReactNode }) {
  const [sel, setSel] = useState<string>(models[0]?.id ?? "");
  const m = models.find((x) => x.id === sel) ?? models[0];
  if (!m) return <Notice>Connect an account first.</Notice>;
  return (
    <div className="space-y-5">
      {models.length > 1 && (
        <div role="tablist" aria-label="Model" className="flex flex-wrap gap-2">
          {models.map((x) => (
            <button key={x.id} type="button" role="tab" aria-selected={x.id === m.id} onClick={() => setSel(x.id)} className={cn("flex items-center gap-2 rounded-lg border py-1 pl-1 pr-3 text-[13px] font-medium transition-colors", x.id === m.id ? "border-fg/40 bg-panel-2 text-fg" : "border-line text-muted hover:text-fg")}>
              <Avatar name={x.name} size={24} /> {x.name}
            </button>
          ))}
        </div>
      )}
      {children(m)}
    </div>
  );
}

function AiStep({ s, integ, reload, back, next }: { s: any; integ: any; reload: () => void; back: () => void; next: () => void }) {
  const [sample, setSample] = useState(false);
  const ok = s.aiReady || sample;
  return (
    <Shell
      title="Connect the AI that writes replies"
      text="DeepSeek writes natural replies in each model's voice. Sample replies work without a key but are basic, so use them only to get started."
      back={back}
      next={{ label: s.aiReady ? "Continue" : sample ? "Continue with sample replies" : "Connect the AI to continue", onClick: () => { localStorage.setItem("ci.onboarding.sample", sample && !s.aiReady ? "1" : ""); next(); }, disabled: !ok }}
    >
      <AiConnection d={integ} reload={reload} />
      {!s.aiReady && (
        <label className="mt-6 flex items-start gap-3 rounded-lg border border-line-strong p-3 text-[13px]">
          <Switch label="Start with sample replies" checked={sample} onChange={setSample} />
          <span>
            <span className="block font-medium">I don't have a key yet: start with sample replies</span>
            <span className="text-muted">You can connect the AI later in Settings. Until then, replies are simple and generic.</span>
          </span>
        </label>
      )}
    </Shell>
  );
}

function QuickPersonality({ accountId, onSaved }: { accountId: string; onSaved: () => void }) {
  const style = useApi<any>(`/api/style?account=${accountId}`);
  const [s, setS] = useState<StyleData | null>(null);
  const { busy, run } = useAction();
  useEffect(() => {
    if (style.data) setS(style.data.active.data);
  }, [style.data]);
  if (!style.data || !s) return <Skeleton className="h-64" />;
  const savedVersion = style.data.active.version;
  const set = (p: Partial<StyleData>) => setS((x) => (x ? { ...x, ...p } : x));
  const save = () =>
    run(
      "save",
      async () => {
        await post("/api/style", { action: "save", accountId, data: s, changeNote: "Set up during onboarding", disclosureText: style.data.account.disclosureText });
        style.reload();
        onSaved();
      },
      `${s.creatorName}'s personality is saved`,
    );
  return (
    <div className="space-y-6">
      <Field label="The name the AI writes as" hint="Usually her first name or stage name.">{(id) => <Input id={id} value={s.creatorName} onChange={(e) => set({ creatorName: e.target.value })} className="max-w-xs" />}</Field>
      <div>
        <p className="mb-2 text-[13px] font-medium">Personality</p>
        <div role="radiogroup" aria-label="Personality" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {PRESETS.map((p) => (
            <button key={p.id} type="button" role="radio" aria-checked={s.tone === p.id} onClick={() => set(p.set)} className={cn("rounded-lg border px-3 py-2.5 text-left transition-colors", s.tone === p.id ? "border-fg/50 bg-panel-2" : "border-line hover:border-line-strong")}>
              <span className="flex items-center justify-between text-[13px] font-medium">
                {p.name} {s.tone === p.id && <Check className="size-3.5" aria-hidden />}
              </span>
              <span className="mt-0.5 block text-[11.5px] leading-snug text-muted">{p.blurb}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Emoji">{() => <Segmented label="Emoji" size="sm" value={s.emoji} onChange={(v) => set({ emoji: v })} className="flex w-full" options={[{ value: "none", label: "None" }, { value: "rare", label: "Rarely" }, { value: "some", label: "Sometimes" }, { value: "often", label: "Often" }]} />}</Field>
        <Field label="Texting style">{() => <Segmented label="Texting style" size="sm" value={s.lowercase ? "lower" : "normal"} onChange={(v) => set({ lowercase: v === "lower" })} className="flex w-full" options={[{ value: "normal", label: "Normal case" }, { value: "lower", label: "all lowercase" }]} />}</Field>
      </div>
      <ListEditor label="True facts about her" placeholder="e.g. Posts new videos on Mondays and Thursdays" items={s.publicFacts} onChange={(v) => set({ publicFacts: v })} max={40} />
      <p className="-mt-3 text-xs text-faint">The AI only states facts from this list. Never add anything that isn't true.</p>
      <div className="grid gap-6 sm:grid-cols-2">
        <ChipEditor label="Phrases she uses" hint="Optional. Used now and then." placeholder="e.g. omg" items={s.preferredExpressions} onChange={(v) => set({ preferredExpressions: v })} />
        <ChipEditor label="Never say" hint="Optional." placeholder="e.g. babe" items={s.avoidPhrases} onChange={(v) => set({ avoidPhrases: v })} tone="danger" />
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
        <Button variant="primary" onClick={save} loading={busy === "save"}>
          Save {s.creatorName}'s personality
        </Button>
        {savedVersion ? <span className="flex items-center gap-1.5 text-[13px] text-muted"><Check className="size-4 text-ok" /> Saved</span> : <span className="text-[13px] text-faint">Not saved yet</span>}
      </div>
    </div>
  );
}

function AutomationStep({ models, back, next }: { models: any[]; back: () => void; next: () => void }) {
  const auto = useApi<any>("/api/automation");
  const { reloadAuto } = useShell();
  const { busy, run } = useAction();
  const tz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);
  if (!auto.data) return <Skeleton className="h-72 rounded-xl" />;
  const r = auto.data.rules;
  const live = auto.data.accounts.filter((a: any) => models.some((m) => m.id === a.id));
  return (
    <Shell title="How much should the AI do?" text="We recommend starting every model on Drafts: the AI writes, you approve. Switch to Auto once you're happy with its replies." back={back} next={{ label: "Continue", onClick: next }}>
      <ul className="divide-y divide-line">
        {live.map((a: any) => (
          <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <span className="flex items-center gap-2.5 text-[13.5px] font-medium">
              <Avatar name={a.displayName} size={28} /> {a.displayName}
            </span>
            <ModelSwitch accountId={a.id} name={a.displayName} mode={a.mode} isSimulated={false} onChange={() => { auto.reload(); reloadAuto(); }} />
          </li>
        ))}
      </ul>
      <div className="mt-6 rounded-lg border border-line-strong p-4">
        <p className="text-[13.5px] font-medium">Reply hours</p>
        <p className="mt-0.5 text-[13px] text-muted">
          Automatic replies go out between {r.activeHours.start} and {r.activeHours.end}, {r.activeHours.timezone.replace(/_/g, " ")} time.
          {r.activeHours.timezone !== tz && ` Your device is on ${tz.replace(/_/g, " ")}.`}
        </p>
        {r.activeHours.timezone !== tz && (
          <Button size="sm" className="mt-3" loading={busy === "tz"} onClick={() => run("tz", () => post("/api/automation", { action: "rules", rules: { ...r, activeHours: { ...r.activeHours, timezone: tz } } }).then(auto.reload), "Reply hours now use your time zone")}>
            Use my time zone
          </Button>
        )}
        <p className="mt-2 text-xs text-faint">Change hours and reply speed any time in Settings → Automation & timing.</p>
      </div>
    </Shell>
  );
}

function DoneStep({ s, back }: { s: any; back: () => void }) {
  const { run, busy } = useAction();
  const connected = s.models.filter((m: any) => m.connected);
  const sample = typeof window !== "undefined" && localStorage.getItem("ci.onboarding.sample") === "1";
  const rows = [
    { ok: connected.length > 0, label: `${connected.length} creator account${connected.length === 1 ? "" : "s"} connected`, required: true },
    { ok: s.aiReady, label: s.aiReady ? "AI connected and tested" : sample ? "Starting with sample replies (connect the AI later)" : "AI not connected", required: !sample },
    { ok: connected.every((m: any) => m.personality), label: "A personality saved for every model", required: false },
    { ok: connected.every((m: any) => m.ppvItems > 0), label: "A PPV menu for every model", required: false },
  ];
  const blocked = rows.some((r) => r.required && !r.ok);
  return (
    <Shell
      title="Ready to go"
      text="Finish setup and we'll show you around in a short guided tour."
      back={back}
      next={{
        label: "Finish & start the tour",
        disabled: blocked,
        loading: busy === "done",
        onClick: () =>
          run("done", async () => {
            await post("/api/onboarding", { action: "complete", acceptSampleReplies: sample });
            localStorage.removeItem("ci.onboarding.step");
            sessionStorage.removeItem("ci.tour.paused");
            localStorage.removeItem("ci.tour.v1");
            location.href = "/";
          }),
      }}
    >
      <ul className="space-y-2.5">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-2.5 text-[13.5px]">
            <span className={cn("flex size-5 items-center justify-center rounded-full border", r.ok ? "border-fg/40 bg-panel-3" : "border-line-strong")}>{r.ok && <Check className="size-3" aria-hidden />}</span>
            <span className={r.ok ? "text-fg" : "text-muted"}>{r.label}</span>
            {!r.ok && !r.required && <span className="text-[11px] text-faint">Optional · do it later</span>}
            {!r.ok && r.required && <span className="text-[11px] text-danger">Required</span>}
          </li>
        ))}
      </ul>
      <div className="mt-6 flex items-center gap-3 rounded-lg border border-line-strong p-4 text-[13px] text-muted">
        <PartyPopper className="size-5 shrink-0 text-fg" aria-hidden />
        Every model starts on the setting you chose. Nothing is sent automatically unless you switched a model to Auto.
      </div>
    </Shell>
  );
}

function TeamMemberSetup({ s }: { s: any }) {
  const { run, busy } = useAction();
  return (
    <div className="mx-auto max-w-xl">
      <Shell
        title="Welcome to the team inbox"
        text={s.models.length ? "The account owner has already connected the creator accounts. Take the short tour to see how everything works." : "The account owner hasn't connected any creator accounts yet. Check back once they have."}
        next={{
          label: "Start the tour",
          disabled: s.models.length === 0,
          loading: busy === "done",
          onClick: () => run("done", async () => { await post("/api/onboarding", { action: "complete" }); location.href = "/"; }),
        }}
      >
        <p className="text-[13.5px] text-muted">You'll see the conversations for the models you've been given access to. You can approve AI replies, take over chats, and stop all sending in an emergency.</p>
      </Shell>
    </div>
  );
}
