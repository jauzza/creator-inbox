"use client";
import { useEffect, useState } from "react";
import { Badge, Button, Card, Dialog, ErrorBox, Field, Input, Loading, ModeBadge, Notice, PageHeader, Select, SimBadge, Switch, Table, Tabs, useAction } from "@/components/ui";
import { ago, fmtTime, post, usd, useApi } from "@/lib/client";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function AutomationPage() {
  const { data, error, loading, reload } = useApi<any>("/api/automation");
  const [tab, setTab] = useState<"controls" | "timing" | "rules" | "queue">("controls");
  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorBox error={error} retry={reload} />;
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader title="Automation" description="New installs start in Draft. The most restrictive of global, account and conversation settings always wins. Random delays are for pacing and workload, not for hiding automation." />
      <Tabs tabs={[{ id: "controls", label: "Master controls" }, { id: "timing", label: "Timing & schedule" }, { id: "rules", label: "Scoring, handoffs, exclusions" }, { id: "queue", label: "Job queue" }]} value={tab} onChange={setTab} />
      {tab === "controls" && <Controls d={data} reload={reload} />}
      {tab === "timing" && <RulesEditor d={data} reload={reload} section="timing" />}
      {tab === "rules" && <RulesEditor d={data} reload={reload} section="rules" />}
      {tab === "queue" && <Queue />}
    </div>
  );
}

export function Controls({ d, reload }: { d: any; reload: () => void }) {
  const { busy, run } = useAction();
  const [confirmAuto, setConfirmAuto] = useState(false);
  const [budget, setBudget] = useState((d.dailyAiBudgetMicros / 1_000_000).toFixed(2));
  const setMode = (mode: string, confirm?: boolean) => run("mode", () => post("/api/automation", { action: "global_mode", mode, confirm }).then(reload), (r: any) => `Global mode set${r?.reverted ? `; ${r.reverted} queued replies returned to Draft` : ""}`);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Global mode" description="Applies to every account unless something more restrictive is set.">
        <div className="flex flex-wrap gap-2">
          {[
            { m: "PAUSED", label: "Disabled", hint: "No AI drafts, no automatic sends" },
            { m: "DRAFT", label: "Draft only", hint: "AI drafts; a person approves every send" },
            { m: "AUTO", label: "Automatic", hint: "Permitted non-explicit replies may auto-send" },
          ].map((o) => (
            <button key={o.m} onClick={() => (o.m === "AUTO" ? setConfirmAuto(true) : setMode(o.m))} aria-pressed={d.globalMode === o.m} className={`flex-1 rounded-lg border p-3 text-left ${d.globalMode === o.m ? "border-accent bg-accent/10" : "border-line hover:border-line-strong"}`}>
              <p className="text-[13px] font-medium">{o.label}</p>
              <p className="text-[11px] text-muted">{o.hint}</p>
            </button>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between rounded-md border border-danger/30 p-3">
          <div>
            <p className="text-[13px] font-medium">Global emergency stop</p>
            <p className="text-[11px] text-muted">Blocks every new send attempt immediately. Also in the top bar.</p>
          </div>
          <Switch label="Emergency stop" checked={d.emergencyStop} onChange={(v) => run("stop", () => post("/api/automation", { action: "emergency_stop", on: v }).then(reload), v ? "Emergency stop ON" : "Emergency stop released")} />
        </div>
      </Card>
      <Card title="Account overrides" description="Optional per-account mode. Can only make things more restrictive.">
        <ul className="divide-y divide-line">
          {d.accounts.map((a: any) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="flex items-center gap-1.5 text-[13px]">{a.displayName} {a.isSimulated && <SimBadge />} {a.modeOverride && <ModeBadge mode={a.modeOverride} />}</span>
              <Select aria-label={`Mode for ${a.displayName}`} className="h-8 w-48" value={a.modeOverride ?? ""} onChange={(e) => run("acct", () => post("/api/automation", { action: "account_mode", accountId: a.id, mode: e.target.value || null }).then(reload), "Account mode updated")} options={[{ value: "", label: "Follow global" }, { value: "AUTO", label: "Auto (if global allows)" }, { value: "DRAFT", label: "Draft only" }, { value: "MANUAL", label: "Manual" }, { value: "PAUSED", label: "Paused" }]} />
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Daily AI spending cap" description="When reached, drafting stops and a handoff is created. Cost is estimated from tokens × configured prices.">
        <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); run("budget", () => post("/api/automation", { action: "budget", dailyAiBudgetMicros: Math.round(Number(budget) * 1_000_000) }).then(reload), "Budget saved"); }}>
          <Field label="USD per day">{(id) => <Input id={id} inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} className="w-32" />}</Field>
          <Button type="submit" loading={busy === "budget"}>Save</Button>
          <span className="pb-2 text-xs text-muted">currently {usd(d.dailyAiBudgetMicros)}</span>
        </form>
      </Card>
      <Dialog open={confirmAuto} onClose={() => setConfirmAuto(false)} title="Enable automatic sending?" footer={<><Button variant="ghost" onClick={() => setConfirmAuto(false)}>Cancel</Button><Button variant="primary" onClick={() => { setConfirmAuto(false); setMode("AUTO", true); }}>Enable Automatic</Button></>}>
        <div className="space-y-2 text-[13px] text-muted">
          <p>Only replies that pass validation, are non-explicit, and fall within active hours, caps and pacing will auto-send. Handoff categories always go to a person. Every AI message carries the disclosure settings you configured.</p>
          <p>Accounts or chats set to Draft, Manual or Paused stay that way. Check the live account's status and the provider's terms first.</p>
        </div>
      </Dialog>
    </div>
  );
}

function num(v: string) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function RulesEditor({ d, reload, section }: { d: any; reload: () => void; section: "timing" | "rules" }) {
  const [r, setR] = useState<any>(d.rules);
  const { busy, run } = useAction();
  const [preview, setPreview] = useState<any>(null);
  const [offsets, setOffsets] = useState("0, 8, 20");
  const [first, setFirst] = useState(true);
  useEffect(() => setR(d.rules), [d.rules]);
  const set = (path: string, value: any) =>
    setR((prev: any) => {
      const next = structuredClone(prev);
      const keys = path.split(".");
      let o = next;
      for (const k of keys.slice(0, -1)) o = o[k];
      o[keys.at(-1)!] = value;
      return next;
    });
  const save = () => run("save", () => post("/api/automation", { action: "rules", rules: r }).then(reload), "Rules saved");
  const runPreview = () =>
    run("preview", async () => {
      const res = await post("/api/automation/preview", { rules: r, offsetsSec: offsets.split(",").map((s) => Math.max(0, Math.round(num(s.trim())))).slice(0, 10), isFirstReply: first });
      setPreview(res);
    });
  const NumField = ({ label, path, hint }: { label: string; path: string; hint?: string }) => (
    <div key={path}>
    <Field label={label} hint={hint}>
      {(id) => <Input id={id} type="number" value={path.split(".").reduce((o, k) => o?.[k], r)} onChange={(e) => set(path, num(e.target.value))} />}
    </Field>
    </div>
  );
  const Preset = ({ name, path }: { name: string; path: string }) => (
    <div className="grid grid-cols-3 gap-2">
      {NumField({ label: `${name} min (s)`, path: `${path}.minSec` })}
      {NumField({ label: `${name} max (s)`, path: `${path}.maxSec` })}
      <Field label="Distribution">{(id) => <Select id={id} value={r[path].distribution} onChange={(e) => set(`${path}.distribution`, e.target.value)} options={[{ value: "uniform", label: "Uniform" }, { value: "triangular", label: "Mostly quick" }, { value: "lognormal", label: "Long tail" }]} />}</Field>
    </div>
  );

  if (section === "timing")
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Reply delays" description="Sampled per reply within your bounds. Validated on save.">
          <div className="space-y-3">
            {Preset({name: "First reply", path: "firstReply"})}
            {Preset({name: "Ongoing", path: "ongoing"})}
            <div className="grid grid-cols-2 gap-2">
              {NumField({label: "Debounce quiet gap (s)", path: "debounce.quietSec", hint: "Wait for the customer to stop typing a burst"})}
              {NumField({label: "Max wait (s)", path: "debounce.maxWaitSec", hint: "Never postpone longer than this"})}
            </div>
            {NumField({label: "Max draft age (min)", path: "maxDraftAgeMin", hint: "Older auto-drafts are re-evaluated before sending"})}
          </div>
        </Card>
        <Card title="Active hours, quiet hours, caps">
          <div className="space-y-3">
            <div className="flex items-center justify-between"><span className="text-[13px]">Active hours</span><Switch label="Active hours" checked={r.activeHours.enabled} onChange={(v) => set("activeHours.enabled", v)} /></div>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Timezone (IANA)" hint="DST handled automatically">{(id) => <Input id={id} value={r.activeHours.timezone} onChange={(e) => set("activeHours.timezone", e.target.value)} />}</Field>
              <Field label="Start">{(id) => <Input id={id} type="time" value={r.activeHours.start} onChange={(e) => set("activeHours.start", e.target.value)} />}</Field>
              <Field label="End">{(id) => <Input id={id} type="time" value={r.activeHours.end} onChange={(e) => set("activeHours.end", e.target.value)} />}</Field>
            </div>
            <div className="flex flex-wrap gap-1">
              {DAYS.map((dname, i) => (
                <button key={dname} type="button" aria-pressed={r.activeHours.days.includes(i)} onClick={() => set("activeHours.days", r.activeHours.days.includes(i) ? r.activeHours.days.filter((x: number) => x !== i) : [...r.activeHours.days, i].sort())} className={`rounded border px-2 py-1 text-xs ${r.activeHours.days.includes(i) ? "border-accent text-accent" : "border-line-strong text-muted"}`}>
                  {dname}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between"><span className="text-[13px]">Quiet hours (no auto-sends)</span><Switch label="Quiet hours" checked={r.quietHours.enabled} onChange={(v) => set("quietHours.enabled", v)} /></div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Quiet from">{(id) => <Input id={id} type="time" value={r.quietHours.start} onChange={(e) => set("quietHours.start", e.target.value)} />}</Field>
              <Field label="Quiet until">{(id) => <Input id={id} type="time" value={r.quietHours.end} onChange={(e) => set("quietHours.end", e.target.value)} />}</Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <NumField label="Per chat / hour" path="caps.perChatPerHour" />
              <NumField label="Per chat / day" path="caps.perChatPerDay" />
              {NumField({label: "Provider min interval (s)", path: "queue.accountMinIntervalSec"})}
              {NumField({label: "Chat cooldown after send (s)", path: "queue.cooldownAfterSendSec"})}
              {NumField({label: "Worker concurrency (info)", path: "queue.concurrency", hint: "Set WORKER_CONCURRENCY in .env to apply"})}
            </div>
          </div>
        </Card>
        <Card title="Preview on a sample conversation" description="Runs the exact scheduling code with your unsaved rules, five times to show the spread." className="lg:col-span-2" actions={<Button variant="primary" loading={busy === "save"} onClick={save}>Save rules</Button>}>
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Customer message offsets (seconds)">{(id) => <Input id={id} value={offsets} onChange={(e) => setOffsets(e.target.value)} className="w-48" />}</Field>
            <label className="flex items-center gap-2 pb-2 text-xs"><input type="checkbox" checked={first} onChange={(e) => setFirst(e.target.checked)} /> first reply in this chat</label>
            <Button loading={busy === "preview"} onClick={runPreview}>Preview</Button>
          </div>
          {preview && (
            <ol className="mt-3 space-y-2">
              {preview.runs.map((p: any, i: number) => (
                <li key={i} className="rounded border border-line p-2 text-xs">
                  <p className="font-medium">{p.ok ? `Sample ${i + 1}: send at ${fmtTime(p.sendAt)} (${ago(p.sendAt)})` : `Sample ${i + 1}: not sent: ${p.reason}`}</p>
                  {p.steps.map((s: string, k: number) => <p key={k} className="text-muted">{s}</p>)}
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    );

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Intent scoring" description="Evidence-based ranking. Fast replies alone never add intent; history alone never adds intent.">
        <div className="grid grid-cols-2 gap-2">
          {NumField({label: "Half-life (hours)", path: "scoring.halfLifeHours"})}
          {NumField({label: "Price question", path: "scoring.weights.priceQuestion"})}
          {NumField({label: "Catalog question", path: "scoring.weights.catalogQuestion"})}
          {NumField({label: "Purchase interest", path: "scoring.weights.purchaseInterest"})}
          {NumField({label: "Prior verified purchase (with a current signal)", path: "scoring.weights.priorPurchase"})}
          {NumField({label: "Recent engagement bump", path: "scoring.weights.recentEngagement"})}
          {NumField({label: "Decline (subtracts)", path: "scoring.weights.declineSignal"})}
        </div>
      </Card>
      <Card title="Handoff rules">
        <div className="space-y-3">
          {NumField({label: "Intent threshold for handoff", path: "handoff.intentThreshold"})}
          <div className="flex items-center justify-between"><span className="text-[13px]">Pause the chat when a handoff is created</span><Switch label="Pause on handoff" checked={r.handoff.pauseOnHandoff} onChange={(v) => set("handoff.pauseOnHandoff", v)} /></div>
          {NumField({label: "Takeover expiry (min, 0 = never; resume manually)", path: "handoff.takeoverExpiryMin"})}
          {NumField({label: "Decline cooldown for offers (days)", path: "offers.declineCooldownDays"})}
          {NumField({label: "Notification cooldown (min)", path: "notifications.cooldownMin"})}
        </div>
      </Card>
      <Card title="Exclusions">
        <Field label="Tags excluded from AI (comma separated)" hint="Customers or chats with these tags are handled manually">
          {(id) => <Input id={id} value={r.exclusions.tags.join(", ")} onChange={(e) => set("exclusions.tags", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} />}
        </Field>
      </Card>
      <Card title="AI disclosure" description="Customer-facing. The app never lets the AI deny automation.">
        <div className="space-y-3">
          <Field label="When to add the account's disclosure text">
            {(id) => <Select id={id} value={r.disclosure.mode} onChange={(e) => set("disclosure.mode", e.target.value)} options={[{ value: "first_ai_message", label: "First AI-assisted message in each chat" }, { value: "every_ai_message", label: "Every AI-assisted message" }]} />}
          </Field>
          <Field label="Tag appended to every AI-written message" hint="Fans API's compliance docs require “#ai” on AI-written content.">{(id) => <Input id={id} value={r.disclosure.tag} onChange={(e) => set("disclosure.tag", e.target.value)} />}</Field>
          {NumField({label: "Context messages sent to the model", path: "ai.contextMessages"})}
          <Field label="Rewrite attempts after validation failure">{(id) => <Select id={id} value={String(r.ai.maxRewrites)} onChange={(e) => set("ai.maxRewrites", Number(e.target.value))} options={[{ value: "0", label: "None (hand off immediately)" }, { value: "1", label: "One bounded rewrite" }]} />}</Field>
        </div>
      </Card>
      <div className="lg:col-span-2 flex justify-end"><Button variant="primary" loading={busy === "save"} onClick={save}>Save rules</Button></div>
    </div>
  );
}

export function Queue() {
  const [status, setStatus] = useState<"active" | "done">("active");
  const { data, error, reload } = useApi<any>(`/api/automation/jobs?status=${status}`, { poll: 4000 });
  const { run } = useAction();
  return (
    <Card title="Durable job queue" description="Stored in Postgres; survives restarts. Every scheduled draft, send, reconciliation and notification is here." actions={<Select aria-label="Status" className="h-8 w-36" value={status} onChange={(e) => setStatus(e.target.value as any)} options={[{ value: "active", label: "Pending / running" }, { value: "done", label: "Finished" }]} />}>
      {error && <ErrorBox error={error} retry={reload} />}
      {data && (
        <>
          <p className="mb-2 text-xs text-muted">{Object.entries(data.counts).map(([k, v]) => `${k.toLowerCase()} ${v}`).join(" · ")}</p>
          {data.jobs.length === 0 ? <Notice>No jobs in this view.</Notice> : (
            <Table head={["Type", "Status", "Run at", "Chat", "Attempts", "Note", ""]}>
              {data.jobs.map((j: any) => (
                <tr key={j.id}>
                  <td className="px-3 py-2 font-mono text-xs">{j.type}</td>
                  <td className="px-3 py-2"><Badge tone={j.status === "FAILED" ? "danger" : j.status === "RUNNING" ? "info" : j.status === "DONE" ? "ok" : "neutral"}>{j.status.toLowerCase()}</Badge></td>
                  <td className="px-3 py-2 text-xs">{fmtTime(j.runAt)} <span className="text-faint">({ago(j.runAt)})</span></td>
                  <td className="px-3 py-2 text-xs">{j.customer ?? "—"}</td>
                  <td className="px-3 py-2 text-xs">{j.attempts}/{j.maxAttempts}</td>
                  <td className="max-w-xs truncate px-3 py-2 text-xs text-muted" title={j.lastError ?? ""}>{j.lastError ?? ""}</td>
                  <td className="px-3 py-2">
                    {j.status === "PENDING" && (
                      <span className="flex gap-1">
                        {!j.type.startsWith("dispatch") && <Button size="sm" variant="ghost" onClick={() => run("j", () => post("/api/automation/jobs", { jobId: j.id, action: "run_now" }).then(reload), "Scheduled now")}>Run now</Button>}
                        <Button size="sm" variant="ghost" onClick={() => run("j", () => post("/api/automation/jobs", { jobId: j.id, action: "cancel" }).then(reload), "Cancelled")}>Cancel</Button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </>
      )}
    </Card>
  );
}
