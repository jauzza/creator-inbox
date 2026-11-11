"use client";
import { useState } from "react";
import { CheckCircle2, Circle, ExternalLink, RefreshCw } from "lucide-react";
import { Badge, Button, cn, Field, Input, Notice, TechDetails, useAction } from "../ui";
import { ago, humanize, post } from "@/lib/client";
import { useShell } from "../shell";

const STATUS: Record<string, { label: string; tone: "ok" | "warn" | "danger" | "neutral"; help: string }> = {
  CONNECTED: { label: "Connected", tone: "ok", help: "Messages are flowing." },
  PENDING: { label: "Waiting", tone: "warn", help: "The account is still being connected on the provider's side. Check again in a minute." },
  TWO_FACTOR_REQUIRED: { label: "Needs a login code", tone: "warn", help: "Finish the two-step login in the Fans API dashboard, then press Check again." },
  VERIFICATION_REQUIRED: { label: "Needs verification", tone: "warn", help: "The platform wants to verify the login. Complete it in the Fans API dashboard." },
  REAUTH_REQUIRED: { label: "Needs reconnecting", tone: "danger", help: "The login expired. Reconnect the account in the Fans API dashboard, then press Check again." },
  DISCONNECTED: { label: "Disconnected", tone: "danger", help: "This account isn't connected any more." },
  ERROR: { label: "Problem", tone: "danger", help: "We couldn't reach this account. Check again, or reconnect it." },
  NOT_CONNECTED: { label: "Not connected", tone: "neutral", help: "" },
};

/** Step-by-step connection for a non-technical creator. */
export function MessagingConnect({ d, reload }: { d: any; reload: () => void }) {
  const m = d.messaging;
  const { me } = useShell();
  const isOwner = me.role === "OWNER";
  const live = d.accounts.filter((a: any) => !a.isSimulated);
  const { busy, run } = useAction();
  const [key, setKey] = useState("");
  const [check, setCheck] = useState<{ ok: boolean; message: string; technical?: string } | null>(null);
  const [remote, setRemote] = useState<any[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const call = (k: string, body: object, ok?: string | ((r: any) => string)) => run(k, () => post("/api/integrations/messaging", body).then((r) => (reload(), r)), ok);

  const step1 = m.key.set && m.lastTest?.ok;
  const step3 = live.some((a: any) => a.connectionStatus === "CONNECTED");

  const saveAndCheck = () =>
    run("key", async () => {
      setCheck(null);
      if (key) await post("/api/integrations/messaging", { action: "save_key", key });
      setKey("");
      const t = await post("/api/integrations/messaging", { action: "test" });
      reload();
      setCheck(t.ok ? { ok: true, message: "Your key works. On to the next step." } : { ok: false, ...humanize(t.detail), technical: t.detail });
    });

  return (
    <div className="space-y-1">
      <Step n={1} done={!!step1} title="Add your connection key" text="Creator Inbox connects through Fans API, an independent service. Create an account with them and copy your API key.">
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-full max-w-sm">
            <Field label="Fans API key" hint={m.key.set ? `A key is saved (${ago(m.key.updatedAt)}). Paste a new one only to replace it.` : undefined}>
              {(id) => <Input id={id} type="password" autoComplete="off" spellCheck={false} value={key} onChange={(e) => setKey(e.target.value)} placeholder={m.key.set ? "••••••••  saved" : "Paste your key"} />}
            </Field>
          </div>
          <Button variant="primary" loading={busy === "key"} disabled={!isOwner || (!key && !m.key.set)} onClick={saveAndCheck}>
            {key || !m.key.set ? "Save & check" : "Check again"}
          </Button>
        </div>
        {check && (
          <div className="mt-3 animate-rise">
            <Notice tone={check.ok ? "ok" : "danger"} title={check.ok ? undefined : "We couldn't connect"}>
              {check.message}
              {check.technical && !check.ok && <TechDetails>{check.technical}</TechDetails>}
            </Notice>
          </div>
        )}
        {!check && m.lastTest && !m.lastTest.ok && (
          <p className="mt-2 text-xs text-danger">
            Last check failed: {humanize(m.lastTest.detail).message} <TechDetails>{m.lastTest.detail}</TechDetails>
          </p>
        )}
      </Step>

      <Step n={2} done={live.length > 0} title="Log in to your creator account on Fans API" text="Connect your creator account in the Fans API dashboard. You log in there, including any login code. This app never asks for your platform password.">
        <p className="flex items-center gap-1.5 text-xs text-faint">
          <ExternalLink className="size-3.5" /> Open your Fans API dashboard in a new tab, connect your account, then come back here.
        </p>
      </Step>

      <Step n={3} done={step3} title="Choose the account to use" text="We'll look up the accounts you connected and let you pick one." last>
        <Button disabled={!m.key.set || !isOwner} loading={busy === "list"} onClick={() => run("list", async () => setRemote((await post("/api/integrations/messaging", { action: "list_accounts" })).accounts))}>
          <RefreshCw className="size-3.5" /> Find my accounts
        </Button>
        {remote && remote.length === 0 && (
          <div className="mt-3">
            <Notice>No accounts found yet. Finish step 2, then press “Find my accounts” again.</Notice>
          </div>
        )}
        {remote && remote.length > 0 && (
          <ul className="mt-3 space-y-2">
            {remote.map((a) => (
              <li key={a.externalAccountId} className="flex flex-wrap items-center gap-2 rounded-xl border border-line p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-medium">{a.displayName || a.externalAccountId}</p>
                  <p className="text-xs text-muted">{STATUS[a.status]?.label ?? a.status}</p>
                </div>
                <Input aria-label="Name to show in the app" className="h-8 w-44" placeholder="Name to show" value={names[a.externalAccountId] ?? ""} onChange={(e) => setNames((n) => ({ ...n, [a.externalAccountId]: e.target.value }))} />
                <Button size="sm" variant="primary" onClick={() => call("sel", { action: "select_account", externalAccountId: a.externalAccountId, displayName: names[a.externalAccountId] || a.displayName || a.externalAccountId }, "Connected! We're fetching your conversations now.")}>
                  Use this account
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Step>

      <p className="pt-3 text-xs leading-relaxed text-faint">
        Good to know: the platform has no official public API for this, and Fans API is a third-party service. Read the platform's current terms before connecting. If anything unexpected comes back, we stop and tell you instead of guessing.
      </p>
    </div>
  );
}

function Step({ n, done, title, text, children, last }: { n: number; done: boolean; title: string; text: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div className="relative flex gap-4">
      <div className="flex flex-col items-center">
        <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold", done ? "bg-ok/15 text-ok" : "bg-panel-3 text-muted ring-1 ring-inset ring-line-strong")}>
          {done ? <CheckCircle2 className="size-4" aria-label="Done" /> : n}
        </span>
        {!last && <span className="my-1 w-px flex-1 bg-line" aria-hidden />}
      </div>
      <div className={cn("min-w-0 flex-1", !last && "pb-7")}>
        <p className="pt-0.5 text-[14px] font-medium">{title}</p>
        <p className="mb-3 mt-0.5 max-w-xl text-[13px] leading-relaxed text-muted">{text}</p>
        {children}
      </div>
    </div>
  );
}

export function AccountList({ d, reload }: { d: any; reload: () => void }) {
  const { busy, run } = useAction();
  const { me } = useShell();
  const [confirm, setConfirm] = useState<any>(null);
  const call = (k: string, body: object, ok: string) => run(k, () => post("/api/integrations/messaging", body).then(reload), ok);
  return (
    <ul className="space-y-2">
      {d.accounts.map((a: any) => {
        const st = a.isSimulated ? { label: "Demo", tone: "neutral" as const, help: "Built-in simulator with pretend customers. Nothing here reaches a real person." } : STATUS[a.connectionStatus] ?? STATUS.ERROR;
        return (
          <li key={a.id} className="rounded-xl border border-line bg-panel p-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className={cn("size-2.5 rounded-full", a.isSimulated ? "bg-info" : st.tone === "ok" ? "bg-ok shadow-[0_0_10px_var(--color-ok)]" : st.tone === "warn" ? "bg-warn" : "bg-danger")} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-[14px] font-medium">
                  {a.displayName}
                  <Badge tone={a.isSimulated ? "info" : st.tone}>{st.label}</Badge>
                </p>
                <p className="mt-0.5 text-[13px] text-muted">{a.isSimulated ? st.help : st.tone === "ok" ? `Last checked ${ago(a.lastSyncOkAt)}.` : st.help}</p>
                {!a.isSimulated && (a.lastSyncError || a.connectionDetail) && <TechDetails>{[a.lastSyncError, a.connectionDetail].filter(Boolean).join(" · ")}</TechDetails>}
              </div>
              {!a.isSimulated && me.role === "OWNER" && (
                <div className="flex gap-1.5">
                  <Button size="sm" loading={busy === `sync${a.id}`} onClick={() => call(`sync${a.id}`, { action: "sync_now", accountId: a.id }, "Checking for new messages…")}>
                    <RefreshCw className="size-3.5" /> Check again
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirm(a)}>Disconnect</Button>
                </div>
              )}
            </div>
          </li>
        );
      })}
      {confirm && (
        <li>
          <Notice
            tone="warn"
            title={`Disconnect ${confirm.displayName}?`}
            action={
              <div className="flex flex-wrap gap-1.5">
                <Button size="xs" onClick={() => { call("dc", { action: "disconnect", accountId: confirm.id, remote: false }, "Disconnected from this app"); setConfirm(null); }}>Only in this app</Button>
                <Button size="xs" variant="danger" onClick={() => { call("dc", { action: "disconnect", accountId: confirm.id, remote: true }, "Disconnected on Fans API too"); setConfirm(null); }}>Here and on Fans API</Button>
                <Button size="xs" variant="ghost" onClick={() => setConfirm(null)}>Cancel</Button>
              </div>
            }
          >
            New messages stop arriving. Disconnecting on Fans API too may delete the data they hold for this account.
          </Notice>
        </li>
      )}
    </ul>
  );
}

export function StatusIcon({ done }: { done: boolean }) {
  return done ? <CheckCircle2 className="size-4 text-ok" /> : <Circle className="size-4 text-faint" />;
}
