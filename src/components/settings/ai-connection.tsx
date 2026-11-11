"use client";
import { useEffect, useState } from "react";
import { CheckCircle2, KeyRound, Sparkles, Wand2 } from "lucide-react";
import { Badge, Button, cn, Field, Input, Notice, TechDetails, useAction } from "../ui";
import { ago, humanize, post } from "@/lib/client";
import { useShell } from "../shell";

type Choice = "offline" | "deepseek" | "openai_compatible";

/**
 * Beginner-friendly AI connection: pick a provider, paste a key (write-only), test.
 * The full technical form lives under "Technical options" on the AI page.
 */
export function AiConnection({ d, reload, onConnected }: { d: any; reload: () => void; onConnected?: () => void }) {
  const s = d.ai.settings;
  const [choice, setChoice] = useState<Choice>(s.provider);
  const [model, setModel] = useState<string>(s.replyModel);
  const [baseUrl, setBaseUrl] = useState<string>(s.baseUrl);
  const [key, setKey] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message: string; technical?: string } | null>(null);
  const { busy, run } = useAction();
  useEffect(() => {
    setChoice(s.provider);
    setModel(s.replyModel);
    setBaseUrl(s.baseUrl);
  }, [s.provider, s.replyModel, s.baseUrl]);

  const connected = s.provider !== "offline" && s.verifiedModel === s.replyModel;
  const isOwner = useShell().me.role === "OWNER";

  const connect = () =>
    run("connect", async () => {
      setResult(null);
      const { verifiedModel, ...rest } = s;
      void verifiedModel;
      await post("/api/integrations/ai", { action: "save_settings", settings: { ...rest, provider: choice, replyModel: choice === "offline" ? rest.replyModel : model, baseUrl: choice === "openai_compatible" ? baseUrl : rest.baseUrl } });
      if (choice === "offline") {
        setResult({ ok: true, message: "Done. Drafts will use the built-in sample replies." });
        reload();
        return;
      }
      if (key) await post("/api/integrations/ai", { action: "save_key", key, slot: "primary" });
      setKey("");
      const t = await post("/api/integrations/ai", { action: "test", slot: "primary" });
      reload();
      if (t.ok) {
        setResult({ ok: true, message: "Connected! Your AI is ready to write replies." });
        onConnected?.();
      } else {
        const h = humanize(t.detail);
        setResult({ ok: false, message: h.message, technical: t.detail });
      }
    });

  const options: { id: Choice; title: string; text: string; icon: React.ReactNode; tag?: string }[] = [
    { id: "offline", title: "Sample replies", text: "Built in and free. Good for trying things out; replies are simple.", icon: <Wand2 className="size-4" />, tag: "No setup" },
    { id: "deepseek", title: "DeepSeek", text: "A real AI model that writes natural replies in your style. Needs a DeepSeek account key.", icon: <Sparkles className="size-4" />, tag: "Recommended" },
    { id: "openai_compatible", title: "Another AI provider", text: "Any service that works like OpenAI's. For people who already have one.", icon: <KeyRound className="size-4" /> },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <span className="text-muted">Right now:</span>
        {s.provider === "offline" ? <Badge>Sample replies</Badge> : connected ? <Badge tone="ok" dot>Connected · {s.provider === "deepseek" ? "DeepSeek" : "Custom provider"}</Badge> : <Badge tone="warn" dot>Needs a quick test</Badge>}
        {d.ai.lastTest && s.provider !== "offline" && <span className="text-xs text-faint">last checked {ago(d.ai.lastTest.at)}</span>}
      </div>
      <div role="radiogroup" aria-label="AI provider" className="grid gap-2 sm:grid-cols-3">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={choice === o.id}
            onClick={() => setChoice(o.id)}
            className={cn("rounded-xl border p-3.5 text-left transition-all", choice === o.id ? "border-accent bg-accent/8 ring-1 ring-accent/40" : "border-line hover:border-line-strong hover:bg-panel-2")}
          >
            <span className="flex items-center justify-between">
              <span className={cn("flex size-7 items-center justify-center rounded-lg", choice === o.id ? "bg-accent/20 text-accent" : "bg-panel-3 text-muted")}>{o.icon}</span>
              {o.tag && <span className="text-[10.5px] font-medium text-faint">{o.tag}</span>}
            </span>
            <span className="mt-2.5 block text-[13.5px] font-medium">{o.title}</span>
            <span className="mt-0.5 block text-xs leading-relaxed text-muted">{o.text}</span>
          </button>
        ))}
      </div>

      {choice === "deepseek" && (
        <div className="grid animate-fade-in gap-4 sm:grid-cols-2">
          <Field label="Model" info="Fast is cheaper and quick. Most capable writes a little better but costs more.">
            {(id) => (
              <div id={id} className="flex gap-1.5">
                {[
                  { v: "deepseek-flash", l: "Fast" },
                  { v: "deepseek-v4-pro", l: "Most capable" },
                ].map((m) => (
                  <button key={m.v} type="button" aria-pressed={model === m.v} onClick={() => setModel(m.v)} className={cn("flex-1 rounded-lg border px-3 py-2 text-[13px]", model === m.v ? "border-accent bg-accent/10 text-fg" : "border-line-strong text-muted hover:text-fg")}>
                    {m.l}
                  </button>
                ))}
              </div>
            )}
          </Field>
          <KeyField d={d} value={key} onChange={setKey} help="Create one in your DeepSeek account under API keys." />
        </div>
      )}
      {choice === "openai_compatible" && (
        <div className="grid animate-fade-in gap-4 sm:grid-cols-2">
          <Field label="Service address" hint="Starts with https://">{(id) => <Input id={id} value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.example.com" />}</Field>
          <Field label="Model name" hint="Exactly as your provider writes it.">{(id) => <Input id={id} value={model} onChange={(e) => setModel(e.target.value)} />}</Field>
          <KeyField d={d} value={key} onChange={setKey} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" loading={busy === "connect"} disabled={!isOwner || (choice !== "offline" && !key && !d.ai.key.set)} onClick={connect}>
          {choice === "offline" ? "Use sample replies" : "Connect & test"}
        </Button>
        {choice !== "offline" && !key && !d.ai.key.set && <span className="text-xs text-faint">Paste your key first.</span>}
        {!isOwner && <span className="text-xs text-faint">Only the account owner can change this.</span>}
      </div>
      {result && (
        <div className="animate-rise">
          {result.ok ? (
            <Notice tone="ok">
              <span className="flex items-center gap-1.5"><CheckCircle2 className="size-4" /> {result.message}</span>
            </Notice>
          ) : (
            <Notice tone="danger" title="We couldn't connect your AI">
              {result.message}
              {result.technical && <TechDetails>{result.technical}</TechDetails>}
            </Notice>
          )}
        </div>
      )}
      <p className="text-xs leading-relaxed text-faint">Your key is encrypted and stored on your own server. It's never shown again, never sent to the AI, and never written to logs.</p>
    </div>
  );
}

function KeyField({ d, value, onChange, help }: { d: any; value: string; onChange: (v: string) => void; help?: string }) {
  return (
    <Field label="Secret key" hint={d.ai.key.set ? `A key is already saved (${ago(d.ai.key.updatedAt)}). Paste a new one only to replace it.` : help}>
      {(id) => <Input id={id} type="password" autoComplete="off" spellCheck={false} value={value} onChange={(e) => onChange(e.target.value)} placeholder={d.ai.key.set ? "••••••••  saved" : "Paste your key"} />}
    </Field>
  );
}
