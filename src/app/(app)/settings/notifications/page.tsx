"use client";
import { useEffect, useState } from "react";
import { Bell, Send } from "lucide-react";
import { Advanced, Button, Card, cn, ErrorBox, Field, Input, Notice, SettingRow, Skeleton, Switch, TechDetails, useAction } from "@/components/ui";
import { ago, humanize, post, useApi } from "@/lib/client";
import { useShell } from "@/components/shell";

const KINDS: { id: string; label: string; hint: string }[] = [
  { id: "handoff", label: "A customer needs you", hint: "Someone asked for a person, a billing question, and similar" },
  { id: "draft_ready", label: "A draft is ready", hint: "Can be a lot of alerts on busy days" },
  { id: "send_failed", label: "A reply couldn't be sent", hint: "" },
  { id: "send_uncertain", label: "We can't confirm a reply was delivered", hint: "" },
  { id: "budget", label: "AI spending limit reached", hint: "" },
  { id: "connection", label: "An account disconnected", hint: "" },
];

export default function NotificationsPage() {
  const { data, error, reload } = useApi<any>("/api/integrations");
  if (error && !data) return <ErrorBox error={error} retry={reload} />;
  if (!data) return <Skeleton className="h-96 rounded-2xl" />;
  return <Body d={data} reload={reload} />;
}

function Body({ d, reload }: { d: any; reload: () => void }) {
  const t = d.telegram;
  const { me } = useShell();
  const owner = me.role === "OWNER";
  const [enabled, setEnabled] = useState<boolean>(t.enabled);
  const [chatId, setChatId] = useState<string>(t.settings.chatId ?? "");
  const [kinds, setKinds] = useState<string[]>(t.settings.kinds ?? []);
  const [token, setToken] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message: string; technical?: string } | null>(null);
  const { busy, run } = useAction();
  useEffect(() => {
    setEnabled(t.enabled);
    setChatId(t.settings.chatId ?? "");
    setKinds(t.settings.kinds ?? []);
  }, [t]);
  const call = (key: string, body: object, ok?: any) => run(key, () => post("/api/integrations/telegram", body).then((r) => (reload(), r)), ok);
  const save = () =>
    run("save", async () => {
      if (token) await post("/api/integrations/telegram", { action: "save_token", token });
      setToken("");
      await post("/api/integrations/telegram", { action: "save_settings", enabled, chatId, kinds: [...new Set([...kinds, "test"])] });
      reload();
    }, "Saved");
  const test = () =>
    run("test", async () => {
      const r = await post("/api/integrations/telegram", { action: "test" });
      reload();
      setResult(r.ok ? { ok: true, message: "Sent! Check Telegram." } : { ok: false, ...humanize(r.detail), technical: r.detail });
    });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[18px] font-semibold tracking-[-0.015em]">Notifications</h2>
        <p className="mt-1 max-w-2xl text-[14px] text-muted">We let you know when something needs you. Alerts never include what customers wrote, only who and why.</p>
      </div>

      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-4 p-5">
          <span className="flex size-10 items-center justify-center rounded-xl bg-accent/12 text-accent"><Bell className="size-5" aria-hidden /></span>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-medium">In the app</p>
            <p className="text-[13px] text-muted">Always on. Look for the bell at the top of the sidebar.</p>
          </div>
          <Button loading={busy === "iat"} onClick={() => call("iat", { action: "in_app_test" }, "Test sent. Check the bell.")}>Send a test</Button>
        </div>
      </Card>

      <Card title="On your phone, with Telegram" description="Optional. Get a Telegram message when something needs you, even when this app is closed." icon={<Send className="size-4" />}>
        <ol className="space-y-5">
          <li className="space-y-2">
            <p className="text-[13.5px] font-medium">1. Create a Telegram bot</p>
            <p className="text-[13px] text-muted">In Telegram, open a chat with <b className="font-medium text-fg">@BotFather</b>, send <code className="rounded bg-panel-3 px-1">/newbot</code> and follow the steps. It gives you a token: paste it here.</p>
            <div className="max-w-sm">
              <Field label="Bot token" hint={t.token.set ? `Saved ${ago(t.token.updatedAt)}. Paste a new one only to replace it.` : undefined}>
                {(id) => <Input id={id} type="password" autoComplete="off" spellCheck={false} value={token} onChange={(e) => setToken(e.target.value)} placeholder={t.token.set ? "••••••••  saved" : "Paste the token"} />}
              </Field>
            </div>
          </li>
          <li className="space-y-2">
            <p className="text-[13.5px] font-medium">2. Tell us where to send alerts</p>
            <p className="text-[13px] text-muted">Open your new bot in Telegram and send it any message, like “hi”. Then press <b className="font-medium text-fg">Find it for me</b>.</p>
            <div className="flex flex-wrap items-end gap-2">
              <div className="w-48">
                <Field label="Chat number">{(id) => <Input id={id} inputMode="numeric" value={chatId} onChange={(e) => setChatId(e.target.value)} placeholder="e.g. 123456789" />}</Field>
              </div>
              <Button loading={busy === "find"} disabled={!owner || (!token && !t.token.set)} onClick={() => run("find", async () => {
                const r = await post("/api/integrations/telegram", { action: "find_chats", ...(token ? { token } : {}) });
                if (!r.ok) setResult({ ok: false, ...humanize(r.detail), technical: r.detail });
                else if (r.chats.length === 0) setResult({ ok: false, message: "We couldn't see a message yet. Send your bot a message in Telegram, wait a few seconds, then try again." });
                else { setChatId(r.chats[r.chats.length - 1].id); setResult({ ok: true, message: `Found it: ${r.chats[r.chats.length - 1].name}. Press Save, then Send a test.` }); }
              })}>Find it for me</Button>
            </div>
          </li>
          <li className="space-y-2">
            <p className="text-[13.5px] font-medium">3. Choose what to be alerted about</p>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {KINDS.map((k) => (
                <label key={k.id} className={cn("flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 transition-colors", kinds.includes(k.id) ? "border-accent/50 bg-accent/6" : "border-line hover:border-line-strong")}>
                  <input type="checkbox" className="mt-0.5 accent-[var(--color-accent)]" checked={kinds.includes(k.id)} onChange={() => setKinds((x) => (x.includes(k.id) ? x.filter((y) => y !== k.id) : [...x, k.id]))} />
                  <span>
                    <span className="block text-[13px]">{k.label}</span>
                    {k.hint && <span className="block text-[11.5px] text-faint">{k.hint}</span>}
                  </span>
                </label>
              ))}
            </div>
          </li>
        </ol>
        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-line pt-5">
          <div className="flex items-center gap-2 text-[13px]">
            <Switch label="Telegram alerts on" checked={enabled} onChange={setEnabled} /> Telegram alerts {enabled ? "on" : "off"}
          </div>
          <div className="ml-auto flex gap-2">
            <Button loading={busy === "test"} disabled={!t.token.set || !t.settings.chatId} onClick={test}>Send a test</Button>
            <Button variant="primary" loading={busy === "save"} disabled={!owner} onClick={save}>Save</Button>
          </div>
        </div>
        {result && (
          <div className="mt-4 animate-rise">
            <Notice tone={result.ok ? "ok" : "danger"} title={result.ok ? undefined : "The test didn't arrive"}>
              {result.message}
              {result.technical && !result.ok && <TechDetails>{result.technical}</TechDetails>}
            </Notice>
          </div>
        )}
        {!result && t.lastTest && (
          <p className={cn("mt-3 text-xs", t.lastTest.ok ? "text-ok" : "text-danger")}>
            Last test {ago(t.lastTest.at)}: {t.lastTest.ok ? "delivered" : humanize(t.lastTest.detail).message}
          </p>
        )}
      </Card>

      <Advanced title="Advanced" description="Remove the bot token">
        <SettingRow title="Remove the Telegram bot token" description="Alerts stop until you add a token again.">
          <Button size="sm" variant="danger" disabled={!owner || !t.token.set} onClick={() => confirm("Remove the Telegram bot token?") && call("del", { action: "delete_token" }, "Token removed")}>Remove token</Button>
        </SettingRow>
      </Advanced>
    </div>
  );
}
