"use client";
import { useEffect, useState } from "react";
import { Bot, Check, OctagonX, PauseCircle, PenLine } from "lucide-react";
import { Advanced, Avatar, Badge, Button, Card, cn, Dialog, ErrorBox, Input, Segmented, SettingRow, SimBadge, Skeleton, Switch, useAction } from "@/components/ui";
import { ModelSwitch } from "@/components/model-switch";
import { post, useApi } from "@/lib/client";
import { useShell } from "@/components/shell";
import { Queue, RulesEditor } from "@/components/settings/automation-advanced";

const SPEEDS = {
  quick: { label: "Quick", hint: "Usually within a minute", firstReply: { minSec: 20, maxSec: 75 }, ongoing: { minSec: 10, maxSec: 45 }, debounce: { quietSec: 15, maxWaitSec: 60 } },
  natural: { label: "Natural", hint: "A few minutes, like a person", firstReply: { minSec: 90, maxSec: 420 }, ongoing: { minSec: 30, maxSec: 180 }, debounce: { quietSec: 45, maxWaitSec: 240 } },
  relaxed: { label: "Relaxed", hint: "Within 5–20 minutes", firstReply: { minSec: 300, maxSec: 1200 }, ongoing: { minSec: 180, maxSec: 600 }, debounce: { quietSec: 60, maxWaitSec: 300 } },
} as const;
type Speed = keyof typeof SPEEDS;

export default function AutomationSettingsPage() {
  const { data, error, reload } = useApi<any>("/api/automation");
  if (error && !data) return <ErrorBox error={error} retry={reload} />;
  if (!data) return <Skeleton className="h-96 rounded-2xl" />;
  return <Body d={data} reload={reload} />;
}

function Body({ d, reload }: { d: any; reload: () => void }) {
  const { me, openStop, reloadAuto } = useShell();
  const owner = me.role === "OWNER";
  const { busy, run } = useAction();
  const [confirmAuto, setConfirmAuto] = useState(false);
  const [r, setR] = useState<any>(d.rules);
  const [budget, setBudget] = useState((d.dailyAiBudgetMicros / 1_000_000).toFixed(2));
  useEffect(() => setR(d.rules), [d.rules]);
  const dirty = JSON.stringify(r) !== JSON.stringify(d.rules);
  const speed = (Object.keys(SPEEDS) as Speed[]).find((k) => SPEEDS[k].firstReply.minSec === r.firstReply.minSec && SPEEDS[k].firstReply.maxSec === r.firstReply.maxSec) ?? "custom";

  const setMode = (mode: string, confirm?: boolean) =>
    run("mode", () => post("/api/automation", { action: "global_mode", mode, confirm }).then((x) => { reload(); reloadAuto(); return x; }), (x: any) => (mode === "AUTO" ? "Automatic replies are on" : mode === "DRAFT" ? `Drafts only.${x?.reverted ? ` ${x.reverted} waiting repl${x.reverted === 1 ? "y is" : "ies are"} back to drafts.` : ""}` : "The AI is switched off"));
  const saveRules = () => run("rules", () => post("/api/automation", { action: "rules", rules: r }).then(reload), "Saved");

  const modes = [
    { m: "PAUSED", title: "Off", text: "The AI doesn't write anything. You reply to everyone yourself.", icon: PauseCircle },
    { m: "DRAFT", title: "Drafts only", text: "The AI writes replies. Nothing is sent until you approve it.", icon: PenLine, tag: "Recommended" },
    { m: "AUTO", title: "Automatic", text: "Simple, safe replies may send by themselves. Anything sensitive still waits for you.", icon: Bot },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[18px] font-semibold tracking-[-0.015em]">Automation &amp; timing</h2>
        <p className="mt-1 max-w-2xl text-[14px] text-muted">Turn auto-reply on per model, and choose how quickly it answers. You can always pause one chat or take over from the inbox.</p>
      </div>

      <Card title="Auto-reply per model" description="Off: the AI stays quiet. Drafts: it writes, you approve. Auto: it replies by itself with natural timing.">
        <ul className="divide-y divide-line">
          {d.accounts.map((a: any) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <span className="flex items-center gap-2.5 text-[13.5px] font-medium">
                <Avatar name={a.displayName} size={30} />
                {a.displayName.replace(" (Demo)", "")}
                {a.isSimulated && <SimBadge />}
              </span>
              <ModelSwitch accountId={a.id} name={a.displayName.replace(" (Demo)", "")} mode={a.mode} isSimulated={a.isSimulated} onChange={() => { reload(); reloadAuto(); }} />
            </li>
          ))}
        </ul>
        {!owner && <p className="mt-3 text-xs text-faint">Only the account owner can change this.</p>}
        <p className="mt-4 text-xs leading-relaxed text-faint">Even on Auto, these always come to you: explicit requests, billing questions and refunds, complaints, safety concerns, and anyone asking for a real person. Paid messages always need your approval.</p>
      </Card>

      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-4 p-5">
          <span className={cn("flex size-10 items-center justify-center rounded-xl", d.emergencyStop ? "bg-danger/20 text-danger" : "bg-danger/10 text-danger")}>
            <OctagonX className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-[14px] font-medium">Emergency stop {d.emergencyStop && <Badge tone="danger" dot>On</Badge>}</p>
            <p className="text-[13px] text-muted">Stops every send in the app at once, including messages you type. Also in the sidebar, always.</p>
          </div>
          <Button variant={d.emergencyStop ? "secondary" : "danger"} onClick={openStop} disabled={d.emergencyStop && !owner}>
            {d.emergencyStop ? "Release the stop" : "Stop all sends"}
          </Button>
        </div>
      </Card>

      <Card title="Timing" description="Applies to automatic replies. Drafts are ready as soon as they're written.">
        <div className="-my-4 divide-y divide-line">
          <SettingRow title="Reply speed" description={speed === "custom" ? "You're using custom timing (see Advanced)." : SPEEDS[speed as Speed].hint + ". The exact delay varies a little each time."}>
            <Segmented
              label="Reply speed"
              size="sm"
              value={speed as Speed}
              onChange={(v) => setR((p: any) => ({ ...p, firstReply: { ...p.firstReply, ...SPEEDS[v].firstReply }, ongoing: { ...p.ongoing, ...SPEEDS[v].ongoing }, debounce: { ...SPEEDS[v].debounce } }))}
              options={(Object.keys(SPEEDS) as Speed[]).map((k) => ({ value: k, label: SPEEDS[k].label }))}
            />
          </SettingRow>
          <SettingRow title="Only reply during my hours" description={r.activeHours.enabled ? `Automatic replies go out between ${r.activeHours.start} and ${r.activeHours.end} (${r.activeHours.timezone.replace("_", " ")}). Others wait until morning.` : "Automatic replies can go out at any time of day."}>
            <Switch label="Only reply during my hours" checked={r.activeHours.enabled} onChange={(v) => setR((p: any) => ({ ...p, activeHours: { ...p.activeHours, enabled: v } }))} />
          </SettingRow>
          {r.activeHours.enabled && (
            <div className="flex flex-wrap items-center gap-2 py-4 text-[13px]">
              <span className="text-muted">From</span>
              <Input aria-label="Start time" type="time" value={r.activeHours.start} onChange={(e) => setR((p: any) => ({ ...p, activeHours: { ...p.activeHours, start: e.target.value } }))} className="w-32" />
              <span className="text-muted">to</span>
              <Input aria-label="End time" type="time" value={r.activeHours.end} onChange={(e) => setR((p: any) => ({ ...p, activeHours: { ...p.activeHours, end: e.target.value } }))} className="w-32" />
              <span className="text-muted">in</span>
              <Input aria-label="Time zone" value={r.activeHours.timezone} onChange={(e) => setR((p: any) => ({ ...p, activeHours: { ...p.activeHours, timezone: e.target.value } }))} className="w-48" />
              <button type="button" className="text-xs text-accent hover:underline" onClick={() => setR((p: any) => ({ ...p, activeHours: { ...p.activeHours, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone } }))}>Use my time zone</button>
            </div>
          )}
          <SettingRow title="Daily AI spending limit" description="When reached, the AI stops drafting until tomorrow and lets you know. Sample replies are free." info="Estimated from the size of each AI request and the prices set under AI Assistant → Advanced.">
            <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); run("budget", () => post("/api/automation", { action: "budget", dailyAiBudgetMicros: Math.round(Number(budget) * 1_000_000) }).then(reload), "Spending limit saved"); }}>
              <span className="text-muted">$</span>
              <Input aria-label="Dollars per day" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} className="w-24" />
              <Button type="submit" size="sm" disabled={!owner || budget === (d.dailyAiBudgetMicros / 1_000_000).toFixed(2)} loading={busy === "budget"}>Save</Button>
            </form>
          </SettingRow>
        </div>
        {dirty && (
          <div className="mt-4 flex animate-rise items-center justify-end gap-2 border-t border-line pt-4">
            <Button variant="ghost" size="sm" onClick={() => setR(d.rules)}>Undo</Button>
            <Button variant="primary" size="sm" onClick={saveRules} loading={busy === "rules"} disabled={!owner}>Save timing</Button>
          </div>
        )}
      </Card>

      <div className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-[0.06em] text-faint">Advanced</p>
        <Advanced title="Detailed timing" description="Exact delays, waiting for a burst of messages, quiet hours, limits per chat, with a preview">
          <RulesEditor d={d} reload={reload} section="timing" />
        </Advanced>
        <Advanced title="Offers and selling" description="How long the AI waits before mentioning a paid item again, and how long a “no” pauses offers">
          <div className="-my-4 divide-y divide-line">
            <SettingRow title="Pause between offers" description="After the AI mentions a paid item, it just chats for at least this long, unless the subscriber asks.">
              <span className="flex items-center gap-2 text-[13px]"><Input aria-label="Hours between offers" type="number" min={0} max={168} value={r.offers.offerCooldownHours} onChange={(e) => setR((p: any) => ({ ...p, offers: { ...p.offers, offerCooldownHours: Number(e.target.value) } }))} className="w-20" /> hours</span>
            </SettingRow>
            <SettingRow title="After a subscriber says no" description="Offers stay paused for that subscriber for this many days.">
              <span className="flex items-center gap-2 text-[13px]"><Input aria-label="Days offers stay paused after a no" type="number" min={0} max={365} value={r.offers.declineCooldownDays} onChange={(e) => setR((p: any) => ({ ...p, offers: { ...p.offers, declineCooldownDays: Number(e.target.value) } }))} className="w-20" /> days</span>
            </SettingRow>
          </div>
          {dirty && <div className="mt-4 flex justify-end gap-2"><Button variant="ghost" size="sm" onClick={() => setR(d.rules)}>Undo</Button><Button variant="primary" size="sm" onClick={saveRules} loading={busy === "rules"} disabled={!owner}>Save</Button></div>}
        </Advanced>
        <Advanced title="Interest scoring, handoffs and disclosure" description="When a customer is passed to you, how interest is scored, and how AI replies are labelled">
          <RulesEditor d={d} reload={reload} section="rules" />
        </Advanced>
        <Advanced title="Background work" description="Every scheduled draft, send and check, stored safely so nothing is lost on restart">
          <Queue />
        </Advanced>
      </div>

      <Dialog
        open={confirmAuto}
        onClose={() => setConfirmAuto(false)}
        title="Turn on automatic replies?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmAuto(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => { setConfirmAuto(false); setMode("AUTO", true); }}>Turn on automatic replies</Button>
          </>
        }
      >
        <ul className="space-y-2 text-[13px] leading-relaxed text-muted">
          <li>• Only simple replies that pass every safety check may go out by themselves, within your timing and hours.</li>
          <li>• Sensitive messages always wait for you: explicit requests, billing, complaints, safety, and requests for a real person.</li>
          <li>• Every AI-written message carries your AI disclosure and the #ai tag.</li>
          <li>• Chats or accounts set to Drafts, Manual or Off stay that way.</li>
        </ul>
        <p className="text-[13px] text-muted">Check your connected account and the platform's terms before you switch this on.</p>
      </Dialog>
    </div>
  );
}

