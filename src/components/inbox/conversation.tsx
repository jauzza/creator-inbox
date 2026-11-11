"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Info, Pause, Play, RefreshCw, Send, UserCheck } from "lucide-react";
import { Badge, Button, cn, Dialog, ModeBadge, Notice, Select, SimBadge, Textarea, useAction } from "../ui";
import { ago, fmtTime, post } from "@/lib/client";

const ORIGIN_LABEL: Record<string, string> = { CUSTOMER: "", AI_AUTO: "AI · auto-sent", AI_APPROVED: "AI draft · approved", HUMAN: "Operator", PROVIDER_SYNC: "Sent outside this app" };
const LABELS = ["good", "too_formal", "too_casual", "repetitive", "invented_fact", "wrong_tone", "wrong_context", "too_pushy", "too_long"];
const JOB_LABEL: Record<string, string> = { generate_reply: "Draft generation", dispatch_draft: "Send reply", dispatch_manual: "Send manual message", reconcile_send: "Check uncertain send", expire_takeover: "Takeover expires", sync_account: "Sync" };

export function ConversationView({ c, reload, onBack, onDetails }: { c: any; reload: () => void; onBack: () => void; onDetails: () => void }) {
  const { busy, run } = useAction();
  const endRef = useRef<HTMLDivElement>(null);
  const [composer, setComposer] = useState("");
  const [confirmAuto, setConfirmAuto] = useState(false);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [c.messages.length]);
  useEffect(() => {
    if (c.messages.length) post(`/api/conversations/${c.id}`, { action: "read" }).catch(() => {});
  }, [c.id, c.messages.length]);

  const act = (key: string, body: object, ok: string) => run(key, () => post(`/api/conversations/${c.id}`, body).then((r) => (reload(), r)), ok);
  const activeDraft = c.drafts.find((d: any) => ["PROPOSED", "QUEUED", "APPROVED", "SENDING", "UNCERTAIN", "HANDOFF", "STALE"].includes(d.status));
  const caps = c.account.capabilities;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header: status prominently, controls */}
      <div className="border-b border-line px-3 py-2.5 sm:px-4">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" className="md:hidden" onClick={onBack} aria-label="Back to conversations">
            <ArrowLeft className="size-4" />
          </Button>
          <h2 className="truncate text-[15px] font-semibold">{c.customer.name}</h2>
          {c.account.isSimulated && <SimBadge />}
          <div className="ml-auto flex items-center gap-1.5">
            <ModeBadge mode={c.policy.mode} large />
            <Button size="sm" variant="ghost" className="xl:hidden" onClick={onDetails} aria-label="Customer details">
              <Info className="size-4" />
            </Button>
          </div>
        </div>
        <p className="mt-1 text-xs text-muted">
          {c.policy.reasons.join(" · ")}
          {c.takeover && ` · taken over by ${c.takeover.by} ${ago(c.takeover.at)}${c.takeover.expiresAt ? `, auto-resumes ${ago(c.takeover.expiresAt)}` : ", resumes only when someone clicks Resume"}`}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {c.takeover ? (
            <Button size="sm" variant="primary" loading={busy === "resume"} onClick={() => act("resume", { action: "resume" }, "Automation resumed for this chat")}>
              <Play className="size-3.5" /> Resume
            </Button>
          ) : (
            <Button size="sm" variant="warn" loading={busy === "takeover"} onClick={() => act("takeover", { action: "takeover" }, "You took over; pending AI work cancelled")}>
              <UserCheck className="size-3.5" /> Take over
            </Button>
          )}
          {c.policy.override === "PAUSED" ? (
            <Button size="sm" loading={busy === "mode"} onClick={() => act("mode", { action: "mode", mode: null }, "Chat un-paused")}>
              <Play className="size-3.5" /> Unpause
            </Button>
          ) : (
            <Button size="sm" loading={busy === "mode"} onClick={() => act("mode", { action: "mode", mode: "PAUSED" }, "Chat paused; queued AI work cancelled")}>
              <Pause className="size-3.5" /> Pause
            </Button>
          )}
          <Select
            aria-label="Conversation mode override"
            className="h-7 w-auto py-0 text-xs"
            value={c.policy.override ?? ""}
            onChange={(e) => {
              const v = e.target.value || null;
              if (v === "AUTO") setConfirmAuto(true);
              else act("mode", { action: "mode", mode: v }, "Mode updated");
            }}
            options={[
              { value: "", label: "Mode: follow account/global" },
              { value: "AUTO", label: "Mode: Auto (if allowed)" },
              { value: "DRAFT", label: "Mode: Draft" },
              { value: "MANUAL", label: "Mode: Manual" },
              { value: "PAUSED", label: "Mode: Paused" },
            ]}
          />
          <Button size="sm" variant="ghost" disabled={!c.policy.aiMayDraft} title={c.policy.aiMayDraft ? "Ask the AI for a fresh draft" : "AI drafting is off in this mode"} loading={busy === "regen"} onClick={() => act("regen", { action: "regenerate" }, "Regenerating draft…")}>
            <RefreshCw className="size-3.5" /> Redraft
          </Button>
        </div>
        {c.nextActions.length > 0 && (
          <p className="mt-2 text-[11px] text-faint">
            Next: {c.nextActions.map((j: any) => `${JOB_LABEL[j.type] ?? j.type} ${j.status === "RUNNING" ? "running now" : ago(j.runAt)}`).join(" · ")}
          </p>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-2 overflow-y-auto px-3 py-4 sm:px-4" aria-live="polite">
        {c.messages.map((m: any) => (
          <div key={m.id} className={cn("flex", m.direction === "OUTBOUND" ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-[85%] rounded-lg px-3 py-2 sm:max-w-[70%]", m.direction === "OUTBOUND" ? "bg-accent/15 text-fg" : "bg-panel-2")}>
              <p className="whitespace-pre-wrap break-words text-[13px]">{m.body}</p>
              <p className="mt-1 text-[10px] text-faint">
                {fmtTime(m.sentAt)}
                {ORIGIN_LABEL[m.origin] && ` · ${ORIGIN_LABEL[m.origin]}`}
                {m.intentDelta ? ` · intent ${m.intentDelta > 0 ? "+" : ""}${m.intentDelta}` : ""}
              </p>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {/* Uncertain / failed sends */}
      {c.sends.filter((s: any) => s.status === "UNCERTAIN" || s.status === "FAILED").map((s: any) => (
        <div key={s.id} className="border-t border-line px-3 py-2 sm:px-4">
          <Notice tone={s.status === "UNCERTAIN" ? "danger" : "warn"}>
            <p className="font-medium">{s.status === "UNCERTAIN" ? "Send result uncertain" : "Send failed"}: “{s.body.slice(0, 80)}”</p>
            <p className="mt-0.5">{s.lastError}</p>
            {s.status === "UNCERTAIN" && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Button size="sm" onClick={() => run("u", () => post(`/api/sends/${s.id}`, { action: "mark_sent" }).then(reload), "Marked as delivered")}>I can see it was delivered</Button>
                <Button size="sm" onClick={() => run("u", () => post(`/api/sends/${s.id}`, { action: "retry" }).then(reload), "Retrying with the same idempotency key")}>Retry (same key)</Button>
                <Button size="sm" variant="ghost" onClick={() => run("u", () => post(`/api/sends/${s.id}`, { action: "discard" }).then(reload), "Discarded")}>Discard</Button>
              </div>
            )}
          </Notice>
        </div>
      ))}

      {activeDraft && <DraftPanel key={activeDraft.id} d={activeDraft} reload={reload} sendsAllowed={c.policy.sendsAllowed} />}

      {/* Manual composer */}
      <form
        className="flex items-end gap-2 border-t border-line p-3 sm:px-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!composer.trim()) return;
          run("send", () => post(`/api/conversations/${c.id}`, { action: "send", body: composer }).then(() => { setComposer(""); reload(); }), "Message queued for sending");
        }}
      >
        <Textarea
          aria-label="Write a manual reply"
          placeholder={c.policy.sendsAllowed ? "Write a reply yourself… (Enter to send, Shift+Enter for newline)" : "Sending is blocked: " + c.policy.reasons.join("; ")}
          className="min-h-10 flex-1"
          rows={1}
          value={composer}
          disabled={!c.policy.sendsAllowed}
          onChange={(e) => setComposer(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              (e.currentTarget.form as HTMLFormElement).requestSubmit();
            }
          }}
        />
        <Button type="submit" variant="primary" loading={busy === "send"} disabled={!composer.trim() || !c.policy.sendsAllowed} aria-label="Send manual message">
          <Send className="size-4" />
        </Button>
      </form>
      <p className="px-4 pb-2 text-[10px] text-faint">
        {caps ? `${c.account.providerLabel}. Typing and read indicators are not shown: the provider doesn't support them reliably.` : c.account.providerLabel}
      </p>

      <Dialog
        open={confirmAuto}
        onClose={() => setConfirmAuto(false)}
        title="Allow automatic replies here?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmAuto(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => { setConfirmAuto(false); act("mode", { action: "mode", mode: "AUTO" }, "Conversation set to Auto"); }}>Allow Auto</Button>
          </>
        }
      >
        <p className="text-[13px] text-muted">Auto only takes effect if the account and global modes also allow it: the most restrictive setting always wins. Only permitted, non-explicit replies that pass validation are sent automatically; everything else stays a draft or goes to a human.</p>
      </Dialog>
    </div>
  );
}

function DraftPanel({ d, reload, sendsAllowed }: { d: any; reload: () => void; sendsAllowed: boolean }) {
  const { busy, run } = useAction();
  const [body, setBody] = useState(d.body);
  const [labels, setLabels] = useState<string[]>(d.labels ?? []);
  const issues: { code: string; severity: string; detail: string }[] = Array.isArray(d.issues) ? d.issues : [];
  const editable = ["PROPOSED", "HANDOFF", "STALE"].includes(d.status);
  const call = (key: string, payload: object, ok: string) => run(key, () => post(`/api/drafts/${d.id}`, payload).then(reload), ok);
  const tone = d.status === "QUEUED" ? "ok" : d.status === "HANDOFF" || d.status === "UNCERTAIN" ? "danger" : d.status === "STALE" ? "warn" : "info";
  return (
    <div className="border-t border-line bg-panel px-3 py-3 sm:px-4">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <Badge tone={tone}>{d.status === "QUEUED" ? `auto-send ${ago(d.scheduledFor)}` : d.status.toLowerCase()}</Badge>
        <Badge>{d.nextAction.toLowerCase()}</Badge>
        <span className="text-[11px] text-faint" title={`Prompt ${d.promptVersion}${d.styleVersion ? `, style v${d.styleVersion}` : ""}`}>
          {d.model === "offline-rules-v1" ? "Simulator AI (offline rules)" : d.model} · {d.latencyMs} ms · {d.tokens} tok
        </span>
      </div>
      {d.explanation && <p className="mb-2 text-xs text-muted">Why: {d.explanation}</p>}
      {d.stale && d.status !== "STALE" && <Notice tone="warn">The customer wrote again after this draft. Review before sending.</Notice>}
      {d.status === "STALE" && <Notice tone="warn">Stale: {d.rejectedReason ?? "conversation changed"}. A fresh draft is generated automatically when AI drafting is on; you can still send this one deliberately.</Notice>}
      {issues.length > 0 && (
        <ul className="my-2 space-y-0.5">
          {issues.map((i, k) => (
            <li key={k} className={cn("text-xs", i.severity === "block" ? "text-danger" : "text-warn")}>
              {i.severity === "block" ? "Blocked" : "Check"}: {i.detail}
            </li>
          ))}
        </ul>
      )}
      {d.nextAction === "WAIT" ? (
        <p className="text-xs text-muted">The AI suggests no reply is needed. You can still write one below.</p>
      ) : (
        <Textarea aria-label="Draft reply" value={body} onChange={(e) => setBody(e.target.value)} disabled={!editable} className="mt-1 min-h-24" />
      )}
      {editable && (
        <div className="mt-2 flex flex-wrap gap-1" aria-label="Review labels">
          {LABELS.map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={labels.includes(l)}
              onClick={() => setLabels((x) => (x.includes(l) ? x.filter((y) => y !== l) : [...x, l]))}
              className={cn("rounded border px-1.5 py-0.5 text-[11px]", labels.includes(l) ? "border-accent text-accent" : "border-line-strong text-muted hover:text-fg")}
            >
              {l.replace(/_/g, " ")}
            </button>
          ))}
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {editable && d.nextAction !== "WAIT" && (
          <Button size="sm" variant="primary" disabled={!sendsAllowed || !body.trim()} loading={busy === "approve"} onClick={() => call("approve", { action: "approve", body, labels, force: d.status === "STALE" || d.stale }, body !== d.originalBody ? "Edited and approved; sending" : "Approved; sending")}>
            {d.status === "STALE" || d.stale ? "Send anyway" : body !== d.originalBody ? "Save edit & send" : "Approve & send"}
          </Button>
        )}
        {editable && (
          <Button size="sm" variant="ghost" loading={busy === "reject"} onClick={() => call("reject", { action: "reject", labels }, "Draft rejected")}>
            Reject
          </Button>
        )}
        {(d.status === "QUEUED" || d.status === "APPROVED") && (
          <Button size="sm" variant="warn" loading={busy === "cancel"} onClick={() => call("cancel", { action: "cancel" }, "Queued reply cancelled; back to draft")}>
            Cancel queued reply
          </Button>
        )}
        {d.status === "SENDING" && <span className="text-xs text-muted">Handing to the provider… once accepted it may not be retractable.</span>}
      </div>
    </div>
  );
}
