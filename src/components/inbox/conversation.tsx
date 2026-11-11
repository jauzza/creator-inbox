"use client";
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowUp, Check, ChevronDown, Hand, MoreHorizontal, Pause, PanelRight, Play, RefreshCw, Sparkles, Undo2, UserRound } from "lucide-react";
import { Avatar, Badge, Button, cn, Dialog, InfoTip, MODE_EXPLAIN, Notice, SimBadge, TechDetails, useAction, type Mode } from "../ui";
import { ago, post } from "@/lib/client";
import { useTour } from "../tour/tour";
import { useShell } from "../shell";

const ORIGIN_LABEL: Record<string, string> = { AI_AUTO: "Sent automatically by AI", AI_APPROVED: "AI draft · approved", HUMAN: "Sent by you", PROVIDER_SYNC: "Sent from the platform" };
const LABELS: [string, string][] = [
  ["good", "Great reply"],
  ["too_formal", "Too formal"],
  ["too_casual", "Too casual"],
  ["too_long", "Too long"],
  ["repetitive", "Repetitive"],
  ["wrong_tone", "Wrong tone"],
  ["invented_fact", "Made something up"],
  ["wrong_context", "Missed the point"],
  ["too_pushy", "Too pushy"],
];
export const ISSUE_TEXT: Record<string, string> = {
  unsupported_price: "Mentions a price that isn't in your catalog",
  invented_activity: "Claims you're doing something right now",
  denies_automation: "Denies that replies are AI-assisted",
  claims_delivery: "Says something was sent, delivered or charged",
  pressure: "Uses pressure or urgency",
  creator_promise: "Makes a promise on your behalf",
  out_of_scope: "Contains explicit content",
  offers_purchased_item: "Offers something they already bought",
  too_long: "Longer than the reply length you chose",
  repetitive: "Very similar to a recent reply",
  generic_assistant: "Sounds like a generic assistant",
  style_emoji: "Uses emoji although you chose none",
  avoid_phrase: "Uses a phrase you asked the AI to avoid",
  too_many_questions: "Asks too many questions",
  empty_reply: "The reply is empty",
};

function statusLine(c: any, meName: string): { text: string; tone: "accent" | "ok" | "warn" | "danger" | "neutral" } {
  const m = c.policy.mode as Mode;
  if (c.policy.reasons.some((r: string) => /emergency stop/i.test(r))) return { text: "All sending is stopped", tone: "danger" };
  if (c.takeover) return { text: `${c.takeover.by === meName ? "You're" : `${c.takeover.by} is`} handling this chat`, tone: "warn" };
  if (m === "AUTO") return { text: "AI replies to simple questions automatically", tone: "ok" };
  if (m === "DRAFT") return { text: "AI writes drafts · you approve", tone: "accent" };
  if (m === "MANUAL") return { text: "Manual · the AI stays quiet", tone: "warn" };
  return { text: c.policy.override === "PAUSED" ? "AI paused for this chat" : "AI is off for this chat", tone: "neutral" };
}

function dayLabel(d: Date) {
  const today = new Date();
  const y = new Date(Date.now() - 86400000);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
}

export function ConversationView({ c, reload, onBack, onDetails, detailsOpen }: { c: any; reload: () => void; onBack: () => void; onDetails: () => void; detailsOpen: boolean }) {
  const { busy, run } = useAction();
  const tour = useTour();
  const scroller = useRef<HTMLDivElement>(null);
  const [confirmAuto, setConfirmAuto] = useState(false);
  const [menu, setMenu] = useState(false);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [c.messages.length, c.drafts[0]?.id]);
  useEffect(() => {
    if (c.messages.length) post(`/api/conversations/${c.id}`, { action: "read" }).catch(() => {});
  }, [c.id, c.messages.length]);

  const act = (key: string, body: object, ok: string, event?: string) =>
    run(key, () => post(`/api/conversations/${c.id}`, body).then((r) => {
      reload();
      if (event && c.isTour) tour.signal(event);
      return r;
    }), ok);
  const activeDraft = c.drafts.find((d: any) => ["PROPOSED", "QUEUED", "APPROVED", "SENDING", "HANDOFF", "STALE"].includes(d.status));
  const genJob = c.nextActions.find((j: any) => j.type === "generate_reply");
  const tourDrafting = c.isTour && tour.active && tour.busy && tour.step?.id === "watch-draft";
  const due = genJob ? Date.now() - new Date(genJob.runAt).getTime() : -1;
  const thinking = tourDrafting || genJob?.status === "RUNNING" || (genJob?.status === "PENDING" && due > -1500 && due < 20000);
  const lastInbound = c.messages.at(-1)?.direction === "INBOUND";
  const { me } = useShell();
  const st = statusLine(c, me.name);
  const paused = c.policy.override === "PAUSED";

  let lastDay = "";
  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-line px-3 py-3 sm:px-5">
        <Button size="icon" variant="ghost" className="md:hidden" onClick={onBack} aria-label="Back to conversations">
          <ArrowLeft className="size-4" />
        </Button>
        <Avatar name={c.customer.name} size={38} />
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.01em]">
            <span className="truncate">{c.customer.name}</span>
            {c.account.isSimulated && <SimBadge />}
          </h2>
          <p className="flex items-center gap-1.5 text-[12.5px] text-muted">
            <span className={cn("size-1.5 rounded-full", { accent: "bg-accent", ok: "bg-ok", warn: "bg-warn", danger: "bg-danger", neutral: "bg-faint" }[st.tone])} aria-hidden />
            <span className="truncate">{st.text}</span>
            <InfoTip label="Why this setting?">
              <span className="block font-medium">{MODE_EXPLAIN[c.policy.mode as Mode]}</span>
              <span className="mt-1 block text-muted">{c.policy.reasons.join(". ")}.</span>
              {c.takeover?.expiresAt && <span className="mt-1 block text-muted">Hands back automatically {ago(c.takeover.expiresAt)}.</span>}
            </InfoTip>
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {!c.takeover && (
            <Button data-tour="ai-toggle" size="sm" variant={paused ? "primary" : "secondary"} loading={busy === "pause"} onClick={() => (paused ? act("pause", { action: "mode", mode: null }, "AI is back on for this chat", "ai-resumed") : act("pause", { action: "mode", mode: "PAUSED" }, "AI paused for this chat. Nothing will be drafted or sent automatically.", "ai-paused"))}>
              {paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
              <span className="hidden sm:inline">{paused ? "Resume AI" : "Pause AI"}</span>
            </Button>
          )}
          {c.takeover ? (
            <Button data-tour="takeover" size="sm" variant="primary" loading={busy === "takeover"} onClick={() => act("takeover", { action: "resume" }, "Handed back to the AI", "handed-back")}>
              <Undo2 className="size-3.5" />
              <span className="hidden sm:inline">Hand back to AI</span>
            </Button>
          ) : (
            <Button data-tour="takeover" size="sm" variant="secondary" loading={busy === "takeover"} onClick={() => act("takeover", { action: "takeover" }, "You're handling this chat. Waiting AI drafts were cancelled.", "took-over")}>
              <Hand className="size-3.5" />
              <span className="hidden sm:inline">Take over</span>
            </Button>
          )}
          <Button size="icon" variant={detailsOpen ? "secondary" : "ghost"} onClick={onDetails} aria-label="Customer details" aria-pressed={detailsOpen} title="Customer details">
            <PanelRight className="size-4" />
          </Button>
          <div className="relative">
            <Button size="icon" variant="ghost" aria-label="More options" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
              <MoreHorizontal className="size-4" />
            </Button>
            {menu && (
              <div className="absolute right-0 top-10 z-30 w-72 animate-pop rounded-xl border border-line-strong bg-panel-2 p-1.5 shadow-2xl" onMouseLeave={() => setMenu(false)}>
                <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wide text-faint">AI for this chat</p>
                {[
                  { v: null, l: "Follow my main setting", h: "Uses the setting from Settings → Automation" },
                  { v: "DRAFT", l: "Drafts only", h: MODE_EXPLAIN.DRAFT },
                  { v: "AUTO", l: "Auto-reply allowed", h: "Only if your main setting also allows it" },
                  { v: "MANUAL", l: "Manual", h: MODE_EXPLAIN.MANUAL },
                  { v: "PAUSED", l: "Paused", h: MODE_EXPLAIN.PAUSED },
                ].map((o) => (
                  <button
                    key={String(o.v)}
                    type="button"
                    className="flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-panel-3"
                    onClick={() => {
                      setMenu(false);
                      if (o.v === "AUTO") setConfirmAuto(true);
                      else act("mode", { action: "mode", mode: o.v }, "Setting updated for this chat");
                    }}
                  >
                    <Check className={cn("mt-0.5 size-3.5 shrink-0", (c.policy.override ?? null) === o.v ? "text-accent" : "text-transparent")} />
                    <span>
                      <span className="block text-[13px]">{o.l}</span>
                      <span className="block text-[11.5px] leading-snug text-faint">{o.h}</span>
                    </span>
                  </button>
                ))}
                <div className="my-1 border-t border-line" />
                <button type="button" disabled={!c.policy.aiMayDraft} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] hover:bg-panel-3 disabled:opacity-40" onClick={() => { setMenu(false); act("regen", { action: "regenerate" }, "Asking the AI for a new draft…"); }}>
                  <RefreshCw className="size-3.5 text-faint" /> Ask AI for a new draft
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <HandoffBanner c={c} reload={reload} />

      {/* Messages */}
      <div ref={scroller} data-tour="message-list" className="flex-1 overflow-y-auto px-4 py-5 sm:px-8" aria-live="polite">
        <div className="mx-auto max-w-2xl space-y-1.5">
          {c.messages.length === 0 && <p className="py-10 text-center text-[13px] text-faint">No messages yet.</p>}
          {c.messages.map((m: any, i: number) => {
            const d = new Date(m.sentAt);
            const label = dayLabel(d);
            const showDay = label !== lastDay;
            lastDay = label;
            const out = m.direction === "OUTBOUND";
            const prev = c.messages[i - 1];
            const grouped = prev && prev.direction === m.direction && !showDay && d.getTime() - new Date(prev.sentAt).getTime() < 5 * 60000;
            return (
              <Fragment key={m.id}>
                {showDay && (
                  <div className="flex items-center gap-3 py-3" role="separator">
                    <span className="h-px flex-1 bg-line" />
                    <span className="text-[11px] font-medium text-faint">{label}</span>
                    <span className="h-px flex-1 bg-line" />
                  </div>
                )}
                <div className={cn("flex animate-rise", out ? "justify-end" : "justify-start", !grouped && "pt-2")}>
                  <div className={cn("max-w-[85%] sm:max-w-[72%]")}>
                    <div className={cn("whitespace-pre-wrap break-words px-3.5 py-2 text-[14px] leading-relaxed", out ? "rounded-2xl rounded-br-md bg-accent text-accent-ink" : "rounded-2xl rounded-bl-md bg-panel-3 text-fg")}>{m.body}</div>
                    <p className={cn("mt-1 px-1 text-[11px] text-faint", out && "text-right")}>
                      {d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      {out && ORIGIN_LABEL[m.origin] && ` · ${ORIGIN_LABEL[m.origin]}`}
                      {out && c.account.isSimulated && " · Demo"}
                    </p>
                  </div>
                </div>
              </Fragment>
            );
          })}
        </div>
      </div>

      {/* Delivery problems */}
      {c.sends.filter((s: any) => s.status === "UNCERTAIN" || s.status === "FAILED").map((s: any) => (
        <div key={s.id} className="px-4 pb-2 sm:px-8">
          <div className="mx-auto max-w-2xl">
            <Notice
              tone={s.status === "UNCERTAIN" ? "danger" : "warn"}
              title={s.status === "UNCERTAIN" ? "We're not sure this reply was delivered" : "This reply couldn't be sent"}
              action={
                s.status === "UNCERTAIN" && (
                  <div className="flex flex-wrap gap-1.5">
                    <Button size="xs" onClick={() => run("u", () => post(`/api/sends/${s.id}`, { action: "mark_sent" }).then(reload), "Marked as delivered")}>I can see it was delivered</Button>
                    <Button size="xs" onClick={() => run("u", () => post(`/api/sends/${s.id}`, { action: "retry" }).then(reload), "Trying again safely (it won't be sent twice)")}>Try again</Button>
                    <Button size="xs" variant="ghost" onClick={() => run("u", () => post(`/api/sends/${s.id}`, { action: "discard" }).then(reload), "Discarded")}>Discard</Button>
                  </div>
                )
              }
            >
              “{s.body.slice(0, 90)}{s.body.length > 90 ? "…" : ""}”{" "}
              {s.status === "UNCERTAIN" ? "Check the conversation on the platform, then tell us what happened. We never resend on our own." : "Nothing was sent. You can write it again below."}
              {s.lastError && <TechDetails>{s.lastError}</TechDetails>}
            </Notice>
          </div>
        </div>
      ))}

      {/* Draft area (also the tour's anchor for "watch the AI write") */}
      <div data-tour="draft-area" className="px-4 sm:px-8">
        <div className="mx-auto max-w-2xl">
          {thinking ? (
            <Thinking />
          ) : activeDraft ? (
            <DraftCard key={activeDraft.id} d={activeDraft} c={c} reload={reload} />
          ) : lastInbound && c.policy.aiMayDraft ? (
            <div className="mb-2 flex items-center justify-between gap-3 rounded-xl border border-dashed border-line px-4 py-3 text-[13px] text-muted">
              <span className="flex items-center gap-2">
                <Sparkles className="size-4 text-faint" aria-hidden />
                {genJob ? `The AI will draft a reply ${ago(genJob.runAt)}.` : "No reply drafted yet."}
              </span>
              {!c.isTour && (
                <Button size="xs" variant="quiet" loading={busy === "regen"} onClick={() => act("regen", { action: "regenerate" }, "Asking the AI for a draft…")}>
                  Draft now
                </Button>
              )}
            </div>
          ) : null}
        </div>
      </div>

      <Composer c={c} reload={reload} />

      <Dialog
        open={confirmAuto}
        onClose={() => setConfirmAuto(false)}
        title="Allow automatic replies in this chat?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmAuto(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => { setConfirmAuto(false); act("mode", { action: "mode", mode: "AUTO" }, "Automatic replies allowed in this chat"); }}>Allow automatic replies</Button>
          </>
        }
      >
        <p className="text-[13px] leading-relaxed text-muted">This only works if your main setting also allows automatic replies; the most careful setting always wins. Only simple, safe replies that pass every check are sent by themselves. Anything else still waits for you.</p>
      </Dialog>
    </div>
  );
}

function Thinking() {
  return (
    <div className="mb-2 flex animate-fade-in items-center gap-3 rounded-2xl border border-accent/25 bg-accent/6 px-4 py-3.5" role="status">
      <span className="flex size-8 items-center justify-center rounded-full bg-accent/15">
        <Sparkles className="size-4 text-accent" aria-hidden />
      </span>
      <div className="flex-1">
        <p className="text-[13.5px] font-medium">Your AI is writing a reply</p>
        <div className="mt-2 space-y-1.5">
          <div className="skeleton h-2.5 w-4/5 rounded-full" />
          <div className="skeleton h-2.5 w-3/5 rounded-full" />
        </div>
      </div>
      <span className="flex gap-1" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span key={i} className="size-1.5 animate-dot rounded-full bg-accent" style={{ animationDelay: `${i * 150}ms` }} />
        ))}
      </span>
    </div>
  );
}

function sourceLabel(model: string) {
  if (model === "offline-rules-v1") return { label: "Sample reply", tip: "Written by built-in example rules because no AI model is connected yet. Connect one in Settings → AI Assistant for natural replies." };
  if (model === "none") return { label: "AI unavailable", tip: "No AI model could be used for this draft." };
  return { label: `Written by ${model}`, tip: "Written by your connected AI model, then checked by the app's safety rules." };
}

function DraftCard({ d, c, reload }: { d: any; c: any; reload: () => void }) {
  const { busy, run } = useAction();
  const tour = useTour();
  const [body, setBody] = useState(d.body);
  const [labels, setLabels] = useState<string[]>(d.labels ?? []);
  const [why, setWhy] = useState(false);
  const [feedback, setFeedback] = useState(false);
  const signalled = useRef(false);
  const ta = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ta.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 260)}px`;
    }
  }, [body]);
  const issues: { code: string; severity: string; detail: string }[] = Array.isArray(d.issues) ? d.issues : [];
  const editable = ["PROPOSED", "HANDOFF", "STALE"].includes(d.status);
  const call = (key: string, payload: object, ok: string, event?: string) =>
    run(key, () => post(`/api/drafts/${d.id}`, payload).then((r) => {
      reload();
      if (event && c.isTour) tour.signal(event);
      return r;
    }), ok);
  const src = sourceLabel(d.model);
  const forced = d.status === "STALE" || d.stale;
  const edited = body !== d.originalBody;

  if (d.nextAction === "WAIT")
    return (
      <div className="mb-2 flex items-center justify-between gap-3 rounded-xl border border-line bg-panel px-4 py-3 text-[13px] text-muted">
        <span className="flex items-center gap-2"><Check className="size-4 text-ok" /> The AI thinks no reply is needed here. {d.explanation && <InfoTip>{d.explanation}</InfoTip>}</span>
        <Button size="xs" variant="ghost" onClick={() => call("reject", { action: "reject" }, "Dismissed")}>Dismiss</Button>
      </div>
    );

  return (
    <div data-tour="draft-card" className="mb-2 animate-rise overflow-hidden rounded-2xl border border-accent/30 bg-panel shadow-[0_8px_40px_-20px_var(--color-accent)]">
      <div className="flex flex-wrap items-center gap-2 border-b border-line/70 bg-accent/5 px-4 py-2.5">
        <Sparkles className="size-4 text-accent" aria-hidden />
        <span className="text-[13px] font-medium">{d.status === "HANDOFF" ? "The AI passed this one to you" : "Suggested reply"}</span>
        {d.status === "QUEUED" ? <Badge tone="ok" dot>Sends {ago(d.scheduledFor)}</Badge> : d.status === "APPROVED" || d.status === "SENDING" ? <Badge tone="ok" dot>Sending…</Badge> : <Badge tone="warn">Not sent yet</Badge>}
        <span className="ml-auto flex items-center gap-1 text-[11.5px] text-faint">
          {src.label}
          <InfoTip label="Where did this reply come from?">{src.tip}</InfoTip>
        </span>
      </div>
      <div className="space-y-3 px-4 py-3">
        {forced && (
          <Notice tone="warn">
            {c.customer.name} wrote again after this draft was written. Read the new message first, then send it anyway or ask for a new draft.
          </Notice>
        )}
        {d.status === "HANDOFF" && (
          <p className="text-[13px] leading-relaxed text-muted">
            {humanHandoff(d.explanation)} Write your own reply below{d.body ? ", or edit the suggestion" : ""}.
          </p>
        )}
        {(d.body || d.status !== "HANDOFF") && (
          <textarea
            ref={ta}
            aria-label="Draft reply (not sent yet)"
            value={body}
            disabled={!editable}
            onChange={(e) => {
              setBody(e.target.value);
              if (!signalled.current && c.isTour) {
                signalled.current = true;
                tour.signal("draft-edited");
              }
            }}
            rows={2}
            className="w-full resize-none rounded-xl border border-line bg-bg/50 px-3.5 py-2.5 text-[14px] leading-relaxed text-fg transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:opacity-70"
          />
        )}
        {issues.length > 0 && (
          <ul className="space-y-1">
            {issues.map((i, k) => (
              <li key={k} className={cn("flex items-start gap-1.5 text-[12.5px]", i.severity === "block" ? "text-danger" : "text-warn")}>
                <span aria-hidden>•</span> {ISSUE_TEXT[i.code] ?? i.detail}
                {i.severity === "block" ? " (blocked)" : ""}
              </li>
            ))}
          </ul>
        )}
        {why && (
          <div className="animate-fade-in rounded-xl bg-panel-2 px-3.5 py-3 text-[12.5px] leading-relaxed text-muted">
            <p className="text-fg/90">{d.explanation || "No explanation was given."}</p>
            <p className="mt-1.5">It used the recent messages in this chat, your approved facts and catalog, and your AI personality{d.styleVersion ? ` (version ${d.styleVersion})` : ""}. Your AI disclosure and the #ai tag are added automatically.</p>
            <TechDetails>
              {d.model} · prompt {d.promptVersion} · {d.latencyMs} ms · {d.tokens} tokens
            </TechDetails>
          </div>
        )}
        {feedback && editable && (
          <div className="flex animate-fade-in flex-wrap gap-1.5" aria-label="Feedback on this draft">
            {LABELS.map(([k, l]) => (
              <button key={k} type="button" aria-pressed={labels.includes(k)} onClick={() => setLabels((x) => (x.includes(k) ? x.filter((y) => y !== k) : [...x, k]))} className={cn("rounded-full border px-2.5 py-1 text-[12px] transition-colors", labels.includes(k) ? "border-accent bg-accent/12 text-accent-strong" : "border-line-strong text-muted hover:text-fg")}>
                {l}
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          {editable && (body || d.status !== "HANDOFF") && (
            <Button size="sm" variant="primary" disabled={!c.policy.sendsAllowed || !body.trim()} loading={busy === "approve"} onClick={() => call("approve", { action: "approve", body, labels, force: forced }, edited ? "Your edited reply is on its way" : "Approved. Your reply is on its way.", "draft-approved")} title={!c.policy.sendsAllowed ? "Sending is blocked here right now" : undefined}>
              <ArrowUp className="size-3.5" /> {forced ? "Send anyway" : edited ? "Send my edit" : "Approve & send"}
            </Button>
          )}
          {editable && (
            <Button size="sm" variant="ghost" loading={busy === "reject"} onClick={() => call("reject", { action: "reject", labels }, "Draft rejected. Nothing was sent.")}>
              Reject
            </Button>
          )}
          {(d.status === "QUEUED" || d.status === "APPROVED") && (
            <Button size="sm" variant="warn" loading={busy === "cancel"} onClick={() => call("cancel", { action: "cancel" }, "Stopped. It's a draft again.")}>
              Don't send
            </Button>
          )}
          <span className="ml-auto flex items-center gap-1">
            <Button size="xs" variant="ghost" aria-expanded={why} onClick={() => setWhy((w) => !w)}>
              Why this reply? <ChevronDown className={cn("size-3 transition-transform", why && "rotate-180")} />
            </Button>
            {editable && (
              <Button size="xs" variant="ghost" aria-expanded={feedback} onClick={() => setFeedback((f) => !f)}>
                Feedback
              </Button>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

function humanHandoff(explanation: string | null) {
  const e = explanation ?? "";
  if (/AI (unavailable|failed)/i.test(e)) return "The AI couldn't write a reply this time.";
  if (/explicit|sexual/i.test(e)) return "This message is outside what the AI is allowed to answer.";
  if (/billing|refund|charge/i.test(e)) return "This looks like a billing question, which a person should answer.";
  if (/Validator/i.test(e)) return "The AI's reply didn't pass the safety checks.";
  return "This message needs a personal touch.";
}

function Composer({ c, reload }: { c: any; reload: () => void }) {
  const { busy, run } = useAction();
  const [text, setText] = useState("");
  const ta = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ta.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
    }
  }, [text]);
  const blocked = !c.policy.sendsAllowed;
  const reason = c.policy.reasons.some((r: string) => /emergency stop/i.test(r)) ? "All sending is stopped. Release the stop to send." : `You can't send here right now: ${c.policy.reasons[0]?.toLowerCase() ?? "blocked"}.`;
  const submit = () => {
    if (!text.trim() || blocked) return;
    run("send", () => post(`/api/conversations/${c.id}`, { action: "send", body: text }).then(() => { setText(""); reload(); }), "Sending your message…");
  };
  return (
    <div className="border-t border-line bg-bg/60 px-4 pb-3 pt-3 backdrop-blur sm:px-8">
      <form className="mx-auto flex max-w-2xl items-end gap-2" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <div className="flex flex-1 items-end rounded-2xl border border-line-strong bg-panel px-3 py-1.5 transition-colors focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20">
          <UserRound className="mb-2 mr-2 size-4 shrink-0 text-faint" aria-hidden />
          <textarea
            ref={ta}
            aria-label="Write your own reply"
            placeholder={blocked ? reason : "Write your own reply…"}
            rows={1}
            value={text}
            disabled={blocked}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            className="max-h-44 min-h-8 flex-1 resize-none bg-transparent py-1.5 text-[14px] leading-relaxed text-fg placeholder:text-faint focus:outline-none disabled:cursor-not-allowed"
          />
        </div>
        <Button type="submit" variant="primary" size="icon" className="mb-0.5 size-10 rounded-full" loading={busy === "send"} disabled={!text.trim() || blocked} aria-label="Send message">
          {busy !== "send" && <ArrowUp className="size-4" />}
        </Button>
      </form>
      <p className="mx-auto mt-1.5 max-w-2xl px-1 text-[11px] text-faint">
        {c.account.isSimulated ? "Demo conversation: replies go to the built-in simulator, never to a real person." : "Enter to send · Shift+Enter for a new line"}
      </p>
    </div>
  );
}

function HandoffBanner({ c, reload }: { c: any; reload: () => void }) {
  const { busy, run } = useAction();
  const [resolving, setResolving] = useState(false);
  const [outcome, setOutcome] = useState("");
  const h = c.handoffs.find((x: any) => x.status === "OPEN" || x.status === "CLAIMED");
  if (!h) return null;
  const call = (body: object, ok: string) => run("h", () => post(`/api/handoffs/${h.id}`, body).then(reload), ok);
  return (
    <div className="border-b border-warn/20 bg-warn/6 px-4 py-2.5 sm:px-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="min-w-0 flex-1 text-[13px]">
          <span className="font-medium text-warn">Needs you: </span>
          <span className="text-fg/90">{h.reason}</span>
          {h.evidence && <span className="text-muted"> · “{h.evidence}”</span>}
        </p>
        <div className="flex gap-1.5">
          {h.status === "OPEN" ? (
            <Button size="xs" loading={busy === "h"} onClick={() => call({ action: "claim" }, "It's yours. Your team can see you're on it.")}>I'm on it</Button>
          ) : (
            <Button size="xs" variant="ghost" onClick={() => call({ action: "release" }, "Released for someone else")}>Release</Button>
          )}
          <Button size="xs" variant="primary" onClick={() => setResolving(true)}>Mark as handled</Button>
        </div>
      </div>
      <Dialog
        open={resolving}
        onClose={() => setResolving(false)}
        title="Mark as handled"
        description="A short note helps your team, and tells you later whether these alerts are useful."
        footer={
          <>
            <Button variant="ghost" onClick={() => setResolving(false)}>Cancel</Button>
            <Button variant="primary" disabled={!outcome.trim()} onClick={() => { setResolving(false); call({ action: "resolve", outcome, useful: null }, "Marked as handled"); }}>Done</Button>
          </>
        }
      >
        <div className="flex flex-wrap gap-1.5">
          {["Answered personally", "Refund handled on the platform", "No reply needed", "Not a real issue"].map((o) => (
            <button key={o} type="button" onClick={() => setOutcome(o)} className={cn("rounded-full border px-2.5 py-1 text-[12.5px]", outcome === o ? "border-accent bg-accent/12 text-accent-strong" : "border-line-strong text-muted hover:text-fg")}>{o}</button>
          ))}
        </div>
        <textarea aria-label="What happened?" value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="Or write what happened…" className="min-h-16 w-full rounded-lg border border-line-strong bg-bg/60 px-3 py-2 text-[13px] focus:border-accent focus:outline-none" />
        <p className="text-xs text-faint">If the AI was paused for this chat, it stays paused until you press Resume AI.</p>
      </Dialog>
    </div>
  );
}
