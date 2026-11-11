"use client";
import { useEffect, useState } from "react";
import { Badge, Button, Card, ErrorBox, Field, Input, Loading, Notice, PageHeader, Select, SimBadge, Switch, useAction } from "@/components/ui";
import { ago, post, useApi } from "@/lib/client";

export function SecretStatus({ s, label }: { s: { set: boolean; updatedAt: string | null }; label: string }) {
  return s.set ? <Badge tone="ok" title={`Saved ${ago(s.updatedAt)}`}>{label} saved</Badge> : <Badge>{label} not set</Badge>;
}
export function TestResult({ t }: { t: { at: string; ok: boolean; detail: string } | null }) {
  if (!t) return <p className="text-[11px] text-faint">Not tested yet.</p>;
  return <p className={`text-xs ${t.ok ? "text-ok" : "text-danger"}`}>{t.ok ? "✓" : "✗"} {t.detail} <span className="text-faint">({ago(t.at)})</span></p>;
}

/** Write-only secret input: the value is sent once and never returned or kept in browser storage. */
export function SecretInput({ label, onSave, busy, hint }: { label: string; onSave: (v: string) => Promise<unknown>; busy?: boolean; hint?: string }) {
  const [v, setV] = useState("");
  return (
    <form className="flex items-end gap-2" onSubmit={async (e) => { e.preventDefault(); await onSave(v); setV(""); }}>
      <Field label={label} hint={hint}>{(id) => <Input id={id} type="password" autoComplete="off" value={v} onChange={(e) => setV(e.target.value)} placeholder="Paste here; never shown again" className="w-72" />}</Field>
      <Button type="submit" loading={busy} disabled={v.length < 8}>Save</Button>
    </form>
  );
}

function IntegrationsPage() {
  const { data, error, loading, reload } = useApi<any>("/api/integrations");
  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorBox error={error} retry={reload} />;
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader title="Integrations" description="Three separate credentials: (1) messaging-provider API key, (2) the connected creator account id, (3) an AI-provider key. Keys are encrypted server-side, never shown again, never sent to the AI, never logged. Owner only." />
      <Onboarding d={data} />
      <Messaging d={data} reload={reload} />
      <Ai d={data} reload={reload} />
      <Telegram d={data} reload={reload} />
    </div>
  );
}

export function Onboarding({ d }: { d: any }) {
  const live = d.accounts.filter((a: any) => !a.isSimulated);
  const steps = [
    ["Choose messaging provider and enter its API key", d.messaging.key.set],
    ["Connect an authorized creator account through the provider's documented flow", live.length > 0],
    ["Select and verify the connected account", live.some((a: any) => a.connectionStatus === "CONNECTED")],
    ["Enter a separate AI-provider key and select a tested model", d.ai.settings.provider === "offline" ? false : d.ai.settings.verifiedModel === d.ai.settings.replyModel],
    ["Preview replies in simulation, then in draft mode", null],
    ["Enable permitted automation deliberately (Automation page)", null],
  ] as const;
  return (
    <Card title="Connection steps">
      <ol className="space-y-1 text-[13px]">
        {steps.map(([s, ok], i) => (
          <li key={i} className="flex items-center gap-2">
            <span className={`flex size-5 items-center justify-center rounded-full text-[11px] ${ok ? "bg-ok/20 text-ok" : "bg-panel-2 text-muted"}`}>{ok ? "✓" : i + 1}</span>
            {s}
          </li>
        ))}
      </ol>
    </Card>
  );
}

export function Messaging({ d, reload }: { d: any; reload: () => void }) {
  const m = d.messaging;
  const { busy, run } = useAction();
  const [baseUrl, setBaseUrl] = useState(m.settings.baseUrl);
  const [poll, setPoll] = useState(m.settings.pollEnabled);
  const [interval, setIntervalSec] = useState(String(m.settings.pollIntervalSec));
  const [remote, setRemote] = useState<any[] | null>(null);
  const [name, setName] = useState("");
  const call = (key: string, body: object, ok?: string | ((r: any) => string)) => run(key, () => post("/api/integrations/messaging", body).then((r) => (reload(), r)), ok);
  return (
    <Card title="Messaging provider: Fans API" description={m.note} actions={<><SecretStatus s={m.key} label="API key" /><SecretStatus s={m.webhookSecret} label="Webhook secret" /></>}>
      <div className="space-y-4">
        <Notice tone="warn">OnlyFans has no verified official public API. This adapter follows Fans API's public docs (checked 2026-11-11) and has <b>not</b> been verified against a live account. Read the platform's current terms before connecting. Unknown responses fail safe; they are never reported as success.</Notice>
        <SecretInput label="Provider API key" busy={busy === "key"} onSave={(v) => call("key", { action: "save_key", key: v }, "Key saved (encrypted)")} />
        <div className="flex flex-wrap gap-2">
          <Button loading={busy === "test"} disabled={!m.key.set} onClick={() => call("test", { action: "test" }, (r) => (r.ok ? "Connection OK" : `Failed: ${r.detail}`))}>Test connection</Button>
          {m.key.set && <Button variant="ghost" onClick={() => call("del", { action: "delete_key" }, "Key deleted")}>Delete key</Button>}
        </div>
        <TestResult t={m.lastTest} />

        <div className="grid gap-3 border-t border-line pt-4 md:grid-cols-3">
          <Field label="API base URL" hint="Domain migration: app.onlyfansapi.com → api.fansapi.com">{(id) => <Select id={id} value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} options={[{ value: "https://app.onlyfansapi.com", label: "app.onlyfansapi.com" }, { value: "https://api.fansapi.com", label: "api.fansapi.com" }]} />}</Field>
          <Field label="Polling interval (s)" hint="Works without a public URL (e.g. on a laptop)">{(id) => <Input id={id} type="number" value={interval} onChange={(e) => setIntervalSec(e.target.value)} />}</Field>
          <div className="flex items-center justify-between pt-5 text-[13px]">Polling enabled <Switch label="Polling" checked={poll} onChange={setPoll} /></div>
          <Button className="md:col-span-3 md:w-fit" loading={busy === "set"} onClick={() => call("set", { action: "save_settings", settings: { baseUrl, pollIntervalSec: Number(interval), pollEnabled: poll } }, "Saved")}>Save provider settings</Button>
        </div>

        <div className="space-y-2 border-t border-line pt-4">
          <p className="text-[13px] font-medium">Webhooks (optional, needs a public HTTPS URL)</p>
          <p className="text-xs text-muted">In the provider dashboard, add the URL below and set a signing secret; paste the same secret here. Unsigned or mis-signed calls are rejected. Webhooks cannot reach localhost, so use polling locally.</p>
          <code className="block break-all rounded bg-bg px-2 py-1 text-xs">{m.webhookUrl}</code>
          <SecretInput label="Webhook signing secret" busy={busy === "wh"} onSave={(v) => call("wh", { action: "save_webhook_secret", secret: v }, "Signing secret saved")} />
        </div>

        <div className="space-y-2 border-t border-line pt-4">
          <p className="text-[13px] font-medium">Connect & select a creator account</p>
          <p className="text-xs text-muted">The creator completes login (including 2FA) in the provider's own hosted flow or dashboard. This app never asks for the OnlyFans password or session cookies. Then list the provider's connected accounts and select one.</p>
          <div className="flex flex-wrap gap-2">
            <Button disabled={!m.key.set} loading={busy === "list"} onClick={() => run("list", async () => setRemote((await post("/api/integrations/messaging", { action: "list_accounts" })).accounts))}>List connected accounts</Button>
          </div>
          {remote && remote.length === 0 && <Notice>No accounts are connected on the provider yet. Connect one in the provider's dashboard, then list again.</Notice>}
          {remote?.map((a) => (
            <div key={a.externalAccountId} className="flex flex-wrap items-center gap-2 rounded border border-line p-2 text-xs">
              <span className="font-mono">{a.externalAccountId}</span> {a.displayName} <Badge tone={a.status === "CONNECTED" ? "ok" : "warn"}>{a.status.toLowerCase().replace(/_/g, " ")}</Badge>
              <Input aria-label="Display name" className="h-7 w-40" placeholder="Display name" value={name} onChange={(e) => setName(e.target.value)} />
              <Button size="sm" variant="primary" onClick={() => call("sel", { action: "select_account", externalAccountId: a.externalAccountId, displayName: name || a.displayName }, "Account selected; first sync queued")}>Select</Button>
            </div>
          ))}
        </div>

        <div className="space-y-1 border-t border-line pt-4">
          <p className="text-[13px] font-medium">Accounts in this workspace</p>
          {d.accounts.map((a: any) => (
            <div key={a.id} className="flex flex-wrap items-center gap-2 py-1 text-xs">
              <span className="font-medium">{a.displayName}</span> {a.isSimulated && <SimBadge />}
              <Badge tone={a.connectionStatus === "CONNECTED" ? "ok" : "warn"}>{a.connectionStatus.toLowerCase().replace(/_/g, " ")}</Badge>
              {!a.isSimulated && <span className="text-muted">last sync {ago(a.lastSyncOkAt)}{a.lastSyncError ? ` · ${a.lastSyncError}` : ""}{a.connectionDetail ? ` · ${a.connectionDetail}` : ""}</span>}
              {!a.isSimulated && (
                <span className="ml-auto flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => call("sync", { action: "sync_now", accountId: a.id }, "Sync queued")}>Sync now</Button>
                  <Button size="sm" variant="ghost" onClick={() => call("dc", { action: "disconnect", accountId: a.id, remote: false }, "Disconnected locally")}>Disconnect here</Button>
                  <Button size="sm" variant="danger" onClick={() => confirm("Disconnect on the provider too? The provider says it deletes account data on disconnect.") && call("dc", { action: "disconnect", accountId: a.id, remote: true }, "Disconnected on provider")}>Disconnect on provider</Button>
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

export function Ai({ d, reload }: { d: any; reload: () => void }) {
  const [s, setS] = useState<any>(d.ai.settings);
  useEffect(() => setS(d.ai.settings), [d.ai.settings]);
  const { busy, run } = useAction();
  const set = (k: string, v: any) => setS((p: any) => ({ ...p, [k]: v }));
  const setAlt = (k: string, v: any) => setS((p: any) => ({ ...p, alternate: { ...p.alternate, [k]: v } }));
  const verified = s.provider === "offline" || d.ai.settings.verifiedModel === d.ai.settings.replyModel;
  const call = (key: string, body: object, ok?: any) => run(key, () => post("/api/integrations/ai", body).then((r) => (reload(), r)), ok);
  const { verifiedModel, ...savable } = s;
  return (
    <section id="ai">
      <Card title="AI provider" description="DeepSeek or any OpenAI-compatible endpoint. Model ids are never assumed current: a model must be listed by the endpoint (where supported) and pass a test completion before it is used." actions={<><SecretStatus s={d.ai.key} label="Primary key" />{verified ? <Badge tone="ok">model verified</Badge> : <Badge tone="danger">needs test</Badge>}</>}>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Provider">{(id) => <Select id={id} value={s.provider} onChange={(e) => set("provider", e.target.value)} options={[{ value: "offline", label: "Simulator AI (offline rules, no key)" }, { value: "deepseek", label: "DeepSeek" }, { value: "openai_compatible", label: "OpenAI-compatible (custom URL)" }]} />}</Field>
          <Field label="Base URL" hint={s.provider === "deepseek" ? "Fixed: https://api.deepseek.com" : "https only; internal addresses blocked"}>{(id) => <Input id={id} value={s.provider === "deepseek" ? "https://api.deepseek.com" : s.baseUrl} disabled={s.provider !== "openai_compatible"} onChange={(e) => set("baseUrl", e.target.value)} />}</Field>
          <Field label="Reply model id" hint="Pre-filled from DeepSeek docs (2026-11-11); verified by the test">{(id) => <Input id={id} value={s.replyModel} onChange={(e) => set("replyModel", e.target.value)} disabled={s.provider === "offline"} />}</Field>
          <Field label="Thinking mode" hint="Not assumed better for chat; compare in the workbench">{(id) => <Select id={id} value={s.thinking} onChange={(e) => set("thinking", e.target.value)} options={[{ value: "disabled", label: "Disabled (faster)" }, { value: "enabled", label: "Enabled (temperature ignored)" }]} />}</Field>
          <Field label="Temperature (blank = provider default)">{(id) => <Input id={id} type="number" step="0.1" value={s.temperature ?? ""} onChange={(e) => set("temperature", e.target.value === "" ? null : Number(e.target.value))} />}</Field>
          <Field label="Max output tokens">{(id) => <Input id={id} type="number" value={s.maxOutputTokens} onChange={(e) => set("maxOutputTokens", Number(e.target.value))} />}</Field>
          <Field label="Timeout (ms)">{(id) => <Input id={id} type="number" value={s.timeoutMs} onChange={(e) => set("timeoutMs", Number(e.target.value))} />}</Field>
          <Field label={`Price for ${s.replyModel} (USD per 1M in / out)`} hint="Used only for the budget estimate. Check the provider's pricing page.">
            {(id) => (
              <div className="flex gap-1">
                <Input id={id} type="number" step="0.01" value={s.pricing[s.replyModel]?.inputPerM ?? 0} onChange={(e) => set("pricing", { ...s.pricing, [s.replyModel]: { ...(s.pricing[s.replyModel] ?? { outputPerM: 0 }), inputPerM: Number(e.target.value) } })} />
                <Input aria-label="Output price" type="number" step="0.01" value={s.pricing[s.replyModel]?.outputPerM ?? 0} onChange={(e) => set("pricing", { ...s.pricing, [s.replyModel]: { ...(s.pricing[s.replyModel] ?? { inputPerM: 0 }), outputPerM: Number(e.target.value) } })} />
              </div>
            )}
          </Field>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="primary" loading={busy === "save"} onClick={() => call("save", { action: "save_settings", settings: savable }, (r: any) => (r.retestRequired ? "Saved: run the connection test before this model is used" : "Saved"))}>Save AI settings</Button>
          <Button loading={busy === "test"} disabled={s.provider !== "offline" && !d.ai.key.set} onClick={() => call("test", { action: "test", slot: "primary" }, (r: any) => (r.ok ? r.detail : `Failed: ${r.detail}`))}>Test model</Button>
        </div>
        <div className="mt-2"><TestResult t={d.ai.lastTest} /></div>
        {s.provider !== "offline" && <div className="mt-3"><SecretInput label="AI provider key (primary)" busy={busy === "k"} onSave={(v) => call("k", { action: "save_key", key: v, slot: "primary" }, "AI key saved (encrypted)")} /></div>}

        <div className="mt-5 space-y-3 border-t border-line pt-4">
          <div className="flex items-center justify-between"><p className="text-[13px] font-medium">Alternate model (for workbench comparisons)</p><Switch label="Alternate enabled" checked={s.alternate.enabled} onChange={(v) => setAlt("enabled", v)} /></div>
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Provider">{(id) => <Select id={id} value={s.alternate.provider} onChange={(e) => setAlt("provider", e.target.value)} options={[{ value: "deepseek", label: "DeepSeek" }, { value: "openai_compatible", label: "OpenAI-compatible" }]} />}</Field>
            <Field label="Base URL">{(id) => <Input id={id} value={s.alternate.provider === "deepseek" ? "https://api.deepseek.com" : s.alternate.baseUrl} disabled={s.alternate.provider === "deepseek"} onChange={(e) => setAlt("baseUrl", e.target.value)} />}</Field>
            <Field label="Model id">{(id) => <Input id={id} value={s.alternate.model} onChange={(e) => setAlt("model", e.target.value)} />}</Field>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <SecretStatus s={d.ai.alternateKey} label="Alternate key" />
            <Button size="sm" disabled={!d.ai.alternateKey.set} onClick={() => call("t2", { action: "test", slot: "alternate" }, (r: any) => (r.ok ? r.detail : `Failed: ${r.detail}`))}>Test alternate</Button>
          </div>
          <SecretInput label="Alternate provider key" onSave={(v) => call("k2", { action: "save_key", key: v, slot: "alternate" }, "Alternate key saved")} />
        </div>
      </Card>
    </section>
  );
}

export function Telegram({ d, reload }: { d: any; reload: () => void }) {
  const t = d.telegram;
  const [enabled, setEnabled] = useState(t.enabled);
  const [chatId, setChatId] = useState(t.settings.chatId ?? "");
  const [kinds, setKinds] = useState<string[]>(t.settings.kinds ?? []);
  const { busy, run } = useAction();
  const call = (key: string, body: object, ok?: any) => run(key, () => post("/api/integrations/telegram", body).then((r) => (reload(), r)), ok);
  const ALL = ["handoff", "draft_ready", "send_failed", "send_uncertain", "budget", "connection"];
  return (
    <section id="telegram">
      <Card title="Notifications: Telegram (optional)" description="Alerts contain the reason, a short customer reference and a dashboard link. Message bodies are never included. Deduplicated with a cooldown; retried through the queue on rate limits." actions={<SecretStatus s={t.token} label="Bot token" />}>
        <div className="space-y-3">
          <SecretInput label="Bot token (from @BotFather)" busy={busy === "tok"} onSave={(v) => call("tok", { action: "save_token", token: v }, "Bot token saved")} />
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Chat id" hint="Message your bot, then use its getUpdates to find the numeric id">{(id) => <Input id={id} value={chatId} onChange={(e) => setChatId(e.target.value)} className="w-48" />}</Field>
            <div className="flex items-center gap-2 pb-2 text-[13px]">Enabled <Switch label="Telegram enabled" checked={enabled} onChange={setEnabled} /></div>
          </div>
          <div className="flex flex-wrap gap-1">
            {ALL.map((k) => <button key={k} type="button" aria-pressed={kinds.includes(k)} onClick={() => setKinds((x) => (x.includes(k) ? x.filter((y) => y !== k) : [...x, k]))} className={`rounded border px-2 py-1 text-xs ${kinds.includes(k) ? "border-accent text-accent" : "border-line-strong text-muted"}`}>{k.replace("_", " ")}</button>)}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button loading={busy === "s"} onClick={() => call("s", { action: "save_settings", enabled, chatId, kinds }, "Saved")}>Save</Button>
            <Button variant="ghost" loading={busy === "iat"} onClick={() => call("iat", { action: "in_app_test" }, "In-app test sent: check the bell")}>Send in-app test</Button>
            <Button loading={busy === "test"} disabled={!t.token.set} onClick={() => call("test", { action: "test" }, (r: any) => (r.ok ? "Test delivered" : `Failed: ${r.detail}`))}>Send test</Button>
          </div>
          <TestResult t={t.lastTest} />
        </div>
      </Card>
    </section>
  );
}
