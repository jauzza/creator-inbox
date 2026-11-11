"use client";
import { useEffect, useState } from "react";
import { Advanced, Button, Card, ErrorBox, Field, Input, Segmented, SettingRow, Skeleton, Switch, useAction } from "@/components/ui";
import { ago, post, useApi } from "@/lib/client";
import { AccountList, MessagingConnect } from "@/components/settings/messaging-connect";
import { useShell } from "@/components/shell";

export default function AccountsPage() {
  const { data, error, reload } = useApi<any>("/api/integrations");
  if (error && !data) return <ErrorBox error={error} retry={reload} />;
  if (!data) return <Skeleton className="h-96 rounded-2xl" />;
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[18px] font-semibold tracking-[-0.015em]">Messaging accounts</h2>
        <p className="mt-1 max-w-2xl text-[14px] text-muted">Connect the creator account your customer messages come from. You can keep using the demo while you set this up.</p>
      </div>
      <AccountList d={data} reload={reload} />
      <Card title="Connect your account" description="Three short steps. You'll need a Fans API account.">
        <MessagingConnect d={data} reload={reload} />
      </Card>
      <MessagingAdvanced d={data} reload={reload} />
    </div>
  );
}

function MessagingAdvanced({ d, reload }: { d: any; reload: () => void }) {
  const m = d.messaging;
  const { me } = useShell();
  const { busy, run } = useAction();
  const [baseUrl, setBaseUrl] = useState(m.settings.baseUrl);
  const [poll, setPoll] = useState(m.settings.pollEnabled);
  const [interval, setIntervalSec] = useState(String(m.settings.pollIntervalSec));
  const [secret, setSecret] = useState("");
  useEffect(() => {
    setBaseUrl(m.settings.baseUrl);
    setPoll(m.settings.pollEnabled);
    setIntervalSec(String(m.settings.pollIntervalSec));
  }, [m.settings]);
  const call = (key: string, body: object, ok: string) => run(key, () => post("/api/integrations/messaging", body).then(reload), ok);
  const owner = me.role === "OWNER";
  return (
    <Advanced title="Advanced" description="Service address, how often we check for messages, instant delivery (webhooks), remove key">
      <div className="-my-4 divide-y divide-line">
        <SettingRow title="Service address" description="Fans API is moving to a new address. Leave this alone unless they ask you to switch." info="app.onlyfansapi.com is the original address; api.fansapi.com is the new one.">
          <Segmented label="Service address" size="sm" value={baseUrl} onChange={setBaseUrl} options={[{ value: "https://app.onlyfansapi.com", label: "app.onlyfansapi.com" }, { value: "https://api.fansapi.com", label: "api.fansapi.com" }]} />
        </SettingRow>
        <SettingRow title="Check for new messages automatically" description="Works everywhere, including on a laptop. Turn off only if you use instant delivery below.">
          <Switch label="Check for new messages automatically" checked={poll} onChange={setPoll} />
        </SettingRow>
        <SettingRow title="How often to check" description="In seconds. Lower is faster but uses more of your Fans API allowance.">
          <Input aria-label="Seconds between checks" type="number" min={15} value={interval} onChange={(e) => setIntervalSec(e.target.value)} className="w-28" />
        </SettingRow>
        <div className="py-4">
          <Button disabled={!owner} loading={busy === "set"} onClick={() => call("set", { action: "save_settings", settings: { baseUrl, pollIntervalSec: Number(interval), pollEnabled: poll } }, "Saved")}>Save these settings</Button>
        </div>
        <div className="space-y-3 py-4">
          <p className="text-[13px] font-medium">Instant delivery (webhooks)</p>
          <p className="max-w-xl text-[13px] text-muted">Only works when this app runs on a server with a public https address, not on a laptop. In the Fans API dashboard, add the address below and a signing secret, then paste the same secret here.</p>
          <code className="block break-all rounded-lg bg-bg px-3 py-2 font-mono text-xs text-muted">{m.webhookUrl}</code>
          <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); call("wh", { action: "save_webhook_secret", secret }, "Signing secret saved"); setSecret(""); }}>
            <div className="w-full max-w-sm">
              <Field label="Signing secret" optional hint={m.webhookSecret.set ? `Saved ${ago(m.webhookSecret.updatedAt)}.` : undefined}>
                {(id) => <Input id={id} type="password" autoComplete="off" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={m.webhookSecret.set ? "••••••••  saved" : "Paste the secret"} />}
              </Field>
            </div>
            <Button type="submit" disabled={!owner || secret.length < 8} loading={busy === "wh"}>Save secret</Button>
          </form>
        </div>
        {m.key.set && (
          <SettingRow title="Remove your connection key" description="New messages stop arriving until you add a key again.">
            <Button variant="danger" size="sm" disabled={!owner} onClick={() => confirm("Remove the Fans API key?") && call("del", { action: "delete_key" }, "Key removed")}>Remove key</Button>
          </SettingRow>
        )}
      </div>
    </Advanced>
  );
}
