"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, MessageCircle, Plus, RefreshCw, RotateCcw, Sparkles, Trash2, Wand2, X } from "lucide-react";
import { Advanced, Avatar, Badge, Button, Card, cn, ErrorBox, Field, InfoTip, Input, Segmented, SettingRow, Skeleton, Slider, Switch, TechDetails, Textarea, useAction, useToast } from "@/components/ui";
import { ago, humanize, post, useApi } from "@/lib/client";
import { useTour } from "@/components/tour/tour";
import { useShell } from "@/components/shell";
import { AiConnection } from "@/components/settings/ai-connection";
import { Ai as AiTechnical } from "@/components/settings/integrations";
import { Experiment, Workbench } from "@/components/settings/style-advanced";
import { Catalog } from "@/components/settings/activity";

type Style = {
  creatorName: string;
  publicFacts: string[];
  boundaries: string[];
  preferredExpressions: string[];
  avoidPhrases: string[];
  language: string;
  tone: "warm" | "playful" | "confident" | "concise" | "professional";
  formality: number;
  expressiveness: number;
  emoji: "none" | "rare" | "some" | "often";
  lowercase: boolean;
  contractions: boolean;
  casualPunctuation: boolean;
  replyLength: "short" | "medium" | "long";
  goodExamples: { customer: string; reply: string; note?: string }[];
  badExamples: { customer: string; reply: string; note?: string }[];
};

const SAMPLE = "Hey! I'm new here. What kind of content do you offer?";

const PRESETS: { id: Style["tone"]; name: string; blurb: string; emoji: string; set: Partial<Style> }[] = [
  { id: "warm", name: "Friendly", blurb: "Warm, kind and easy-going", emoji: "😊", set: { tone: "warm", formality: 30, expressiveness: 60, emoji: "rare", replyLength: "short" } },
  { id: "playful", name: "Playful", blurb: "Fun, bubbly, lots of energy", emoji: "✨", set: { tone: "playful", formality: 15, expressiveness: 85, emoji: "often", replyLength: "medium" } },
  { id: "confident", name: "Confident", blurb: "Direct, cool and self-assured", emoji: "😎", set: { tone: "confident", formality: 50, expressiveness: 40, emoji: "rare", replyLength: "short" } },
  { id: "professional", name: "Professional", blurb: "Polished, clear and courteous", emoji: "💼", set: { tone: "professional", formality: 85, expressiveness: 25, emoji: "none", replyLength: "medium", lowercase: false } },
  { id: "concise", name: "Short & sweet", blurb: "Gets to the point, fast", emoji: "⚡", set: { tone: "concise", formality: 40, expressiveness: 30, emoji: "none", replyLength: "short" } },
];
const TONE_NAME = Object.fromEntries(PRESETS.map((p) => [p.id, p.name])) as Record<Style["tone"], string>;
const LENGTH_NAME = { short: "Short", medium: "Balanced", long: "Detailed" };
const EMOJI_NAME = { none: "None", rare: "Rarely", some: "Sometimes", often: "Often" };
const word = (n: number, lo: string, hi: string) => (n < 34 ? lo : n > 66 ? hi : "Balanced");

function diff(a: Style, b: Style): { label: string; from: string; to: string }[] {
  const out: { label: string; from: string; to: string }[] = [];
  const push = (label: string, from: string, to: string) => from !== to && out.push({ label, from, to });
  push("Tone", TONE_NAME[a.tone], TONE_NAME[b.tone]);
  push("Length", LENGTH_NAME[a.replyLength], LENGTH_NAME[b.replyLength]);
  push("Emoji", EMOJI_NAME[a.emoji], EMOJI_NAME[b.emoji]);
  if (a.formality !== b.formality) push("Writing style", `${word(a.formality, "Casual", "Polished")} (${a.formality})`, `${word(b.formality, "Casual", "Polished")} (${b.formality})`);
  if (a.expressiveness !== b.expressiveness) push("Personality", `${word(a.expressiveness, "Reserved", "Expressive")} (${a.expressiveness})`, `${word(b.expressiveness, "Reserved", "Expressive")} (${b.expressiveness})`);
  push("Lowercase", a.lowercase ? "On" : "Off", b.lowercase ? "On" : "Off");
  push("Contractions", a.contractions ? "On" : "Off", b.contractions ? "On" : "Off");
  push("Language", a.language, b.language);
  if (JSON.stringify(a.publicFacts) !== JSON.stringify(b.publicFacts)) push("Facts", `${a.publicFacts.length}`, `${b.publicFacts.length}`);
  if (JSON.stringify(a.preferredExpressions) !== JSON.stringify(b.preferredExpressions)) push("Favourite phrases", `${a.preferredExpressions.length}`, `${b.preferredExpressions.length}`);
  if (JSON.stringify(a.avoidPhrases) !== JSON.stringify(b.avoidPhrases)) push("Never say", `${a.avoidPhrases.length}`, `${b.avoidPhrases.length}`);
  if (JSON.stringify(a.boundaries) !== JSON.stringify(b.boundaries)) push("Boundaries", `${a.boundaries.length}`, `${b.boundaries.length}`);
  if (JSON.stringify(a.goodExamples) !== JSON.stringify(b.goodExamples)) push("Example replies", `${a.goodExamples.length}`, `${b.goodExamples.length}`);
  if (a.creatorName !== b.creatorName) push("Name", a.creatorName, b.creatorName);
  return out;
}

export default function AiSettingsPage() {
  const style = useApi<any>("/api/style");
  const integ = useApi<any>("/api/integrations");
  if (style.error && !style.data) return <ErrorBox error={style.error} retry={style.reload} />;
  if (!style.data || !integ.data)
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-60" />
        <div className="grid gap-6 xl:grid-cols-[1fr_400px]">
          <Skeleton className="h-[520px] rounded-2xl" />
          <Skeleton className="h-[420px] rounded-2xl" />
        </div>
      </div>
    );
  return <Editor key={style.data.active.version ?? "default"} d={style.data} integ={integ.data} reload={() => { style.reload(); integ.reload(); }} />;
}

function Editor({ d, integ, reload }: { d: any; integ: any; reload: () => void }) {
  const saved: Style = d.active.data;
  const [s, setS] = useState<Style>(saved);
  const [disclosure, setDisclosure] = useState<string>(d.account.disclosureText);
  const tour = useTour();
  const { me } = useShell();
  const { busy, run } = useAction();
  const toast = useToast();
  const dirty = JSON.stringify(s) !== JSON.stringify(saved) || disclosure !== d.account.disclosureText;
  const changes = useMemo(() => diff(saved, s), [saved, s]);
  const signalChange = useRef(false);

  const update = useCallback((patch: Partial<Style>) => {
    setS((p) => ({ ...p, ...patch }));
    if (!signalChange.current) {
      signalChange.current = true;
      tour.signal("style-changed");
    }
  }, [tour]);

  const save = () =>
    run(
      "save",
      async () => {
        const note = changes.length ? changes.map((c) => `${c.label}: ${c.to}`).join(", ").slice(0, 190) : "Updated";
        const r = await post("/api/style", { action: "save", accountId: d.account.id, data: s, changeNote: note, disclosureText: disclosure });
        tour.signal("style-decided");
        reload();
        return r;
      },
      (r: any) => `Saved. Your AI now uses this style (version ${r.version}).`,
    );
  const undo = () => {
    setS(saved);
    setDisclosure(d.account.disclosureText);
    signalChange.current = false;
    tour.signal("style-decided");
    toast("Changes undone", "info");
  };

  return (
    <div className="pb-24">
      <div className="mb-6">
        <h2 className="text-[18px] font-semibold tracking-[-0.015em]">AI Assistant</h2>
        <p className="mt-1 max-w-2xl text-[14px] text-muted">Choose how your AI sounds and what it knows. Try changes on the right before you save. Nothing changes for customers until you press Save.</p>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px] xl:gap-x-6">
        <div className="min-w-0 xl:col-start-1 xl:row-start-1">
          <Card padded={false} className="overflow-hidden">
            <div data-tour="ai-personality" className="p-5">
              <h3 className="text-[14.5px] font-semibold">Personality</h3>
              <p className="mt-0.5 text-[13px] text-muted">Start from a preset, then fine-tune.</p>
              <div role="radiogroup" aria-label="Personality preset" className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 2xl:grid-cols-5">
                {PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    role="radio"
                    aria-checked={s.tone === p.id}
                    onClick={() => update(p.set)}
                    className={cn("group rounded-xl border px-3 py-3 text-left transition-all duration-150", s.tone === p.id ? "border-accent bg-accent/10 ring-1 ring-accent/40" : "border-line bg-panel-2/40 hover:-translate-y-px hover:border-line-strong")}
                  >
                    <span className="text-lg" aria-hidden>{p.emoji}</span>
                    <span className="mt-1.5 flex items-center justify-between text-[13.5px] font-medium">
                      {p.name}
                      {s.tone === p.id && <Check className="size-3.5 text-accent" aria-hidden />}
                    </span>
                    <span className="mt-0.5 block text-[11.5px] leading-snug text-muted">{p.blurb}</span>
                  </button>
                ))}
              </div>

              <div className="mt-6 grid gap-x-8 gap-y-6 md:grid-cols-2">
                <Field label="Reply length" info="How much the AI writes. Short is one or two sentences.">
                  {(id) => (
                    <Segmented label="Reply length" value={s.replyLength} onChange={(v) => update({ replyLength: v })} className="flex w-full" options={[{ value: "short", label: "Short" }, { value: "medium", label: "Balanced" }, { value: "long", label: "Detailed" }]} />
                  )}
                </Field>
                <Field label="Emoji" info="The AI never forces an emoji into a reply; this sets how often it may use one.">
                  {() => (
                    <Segmented label="Emoji" value={s.emoji} onChange={(v) => update({ emoji: v })} className="flex w-full" options={[{ value: "none", label: "None" }, { value: "rare", label: "Rarely" }, { value: "some", label: "Sometimes" }, { value: "often", label: "Often" }]} />
                  )}
                </Field>
                <Field label={`Writing style · ${word(s.formality, "Casual", "Polished")}`} info="Casual sounds like texting a friend. Polished uses full sentences and standard capitalisation.">
                  {(id) => <Slider id={id} label="Writing style" value={s.formality} onChange={(v) => update({ formality: v })} left="Casual" right="Polished" />}
                </Field>
                <Field label={`Personality · ${word(s.expressiveness, "Reserved", "Expressive")}`} info="Reserved is calm and understated. Expressive is enthusiastic, with more exclamation marks.">
                  {(id) => <Slider id={id} label="Personality" value={s.expressiveness} onChange={(v) => update({ expressiveness: v })} left="Reserved" right="Expressive" />}
                </Field>
              </div>
            </div>
            <div className="border-t border-line px-5">
              <Advanced title="More writing options" description="Lowercase, contractions, punctuation, language">
                <div className="-my-4 divide-y divide-line">
                  <SettingRow title="Mostly lowercase" description="Write like a casual text message: “hey! new sets go up…”">
                    <Switch label="Mostly lowercase" checked={s.lowercase} onChange={(v) => update({ lowercase: v })} />
                  </SettingRow>
                  <SettingRow title="Use contractions" description="“you'll” and “it's” instead of “you will” and “it is”.">
                    <Switch label="Use contractions" checked={s.contractions} onChange={(v) => update({ contractions: v })} />
                  </SettingRow>
                  <SettingRow title="Relaxed punctuation" description="Allows a casual “!!” or dropped full stops.">
                    <Switch label="Relaxed punctuation" checked={s.casualPunctuation} onChange={(v) => update({ casualPunctuation: v })} />
                  </SettingRow>
                  <SettingRow title="Language" description="The AI switches automatically if a customer writes in another language.">
                    <Input aria-label="Language" value={s.language} onChange={(e) => update({ language: e.target.value })} className="w-40" />
                  </SettingRow>
                </div>
              </Advanced>
              <div className="h-5" />
            </div>
          </Card>
        </div>

        <Preview saved={saved} current={s} dirty={dirty} changes={changes} accountId={d.account.id} sampleLabel={integ.ai.settings.provider === "offline"} onKeep={save} onUndo={undo} saving={busy === "save"} />

        <div className="min-w-0 space-y-5 xl:col-start-1 xl:row-start-2">
          <Card title="What your AI knows" description="The AI only states facts from this list. Anything else, it asks or hands to you.">
            <div className="space-y-5">
              <Field label="Name the AI writes as">{(id) => <Input id={id} value={s.creatorName} onChange={(e) => update({ creatorName: e.target.value })} className="max-w-xs" />}</Field>
              <ListEditor label="Facts about you" placeholder="e.g. I post new sets on Tuesdays and Fridays" items={s.publicFacts} onChange={(v) => update({ publicFacts: v })} max={40} />
              <Advanced title="Items you sell" description="Your catalog. The AI only mentions these items and prices.">
                <Catalog />
              </Advanced>
            </div>
          </Card>

          <Card title="Words and boundaries" description="Phrases that sound like you, and lines the AI must never cross.">
            <div className="grid gap-6 md:grid-cols-2">
              <ChipEditor label="Phrases you like" hint="Used now and then, never forced." placeholder="e.g. thanks so much" items={s.preferredExpressions} onChange={(v) => update({ preferredExpressions: v })} />
              <ChipEditor label="Never say" hint="The AI avoids these, and we flag drafts that use them." placeholder="e.g. babe" items={s.avoidPhrases} onChange={(v) => update({ avoidPhrases: v })} tone="danger" />
            </div>
            <div className="mt-6">
              <ListEditor label="Boundaries" placeholder="e.g. Never promise custom content" items={s.boundaries} onChange={(v) => update({ boundaries: v })} max={30} />
              <p className="mt-2 text-xs text-faint">Always on, whatever you write here: no explicit content, no pretending to be online right now, no made-up prices or promises, and honest answers if someone asks whether replies are AI-assisted.</p>
            </div>
          </Card>

          <Card title="Example replies" description="Show the AI how you'd answer. It picks the most relevant few each time.">
            <ExamplesEditor items={s.goodExamples} onChange={(v) => update({ goodExamples: v })} />
          </Card>

          <Card title="Being upfront about AI" description="Customers are told when replies are AI-assisted. This text is added to the first AI-written message in each chat, plus the #ai tag.">
            <Textarea aria-label="AI disclosure text" value={disclosure} onChange={(e) => setDisclosure(e.target.value)} className="min-h-16" />
            <p className="mt-2 text-xs text-faint">Change when it's added under Automation &amp; scheduling → Advanced.</p>
          </Card>

          <div className="space-y-3 pt-2">
            <p className="text-xs font-medium uppercase tracking-[0.06em] text-faint">Advanced</p>
            <Advanced id="connection" title="AI connection" description={integ.ai.settings.provider === "offline" ? "Using sample replies. Connect a real AI model for natural replies." : "Which AI model writes your drafts"} defaultOpen={typeof window !== "undefined" && location.hash === "#connection"}>
              <AiConnection d={integ} reload={reload} />
              <div className="mt-5">
                <Advanced title="Technical options" description="Model names, service address, response limits, creativity, timeouts, pricing">
                  <AiTechnical d={integ} reload={reload} />
                </Advanced>
              </div>
            </Advanced>
            <Advanced title="Style history" description="Every save is kept. Roll back any time.">
              <Versions d={d} reload={reload} canEdit={me.role === "OWNER"} />
            </Advanced>
            <Advanced title="Reply quality lab" description="Test your AI against 81 practice conversations and compare results blind">
              <Workbench />
            </Advanced>
            <Advanced title="A/B test two styles" description="Split customers between two saved styles and compare results">
              <Experiment d={d} reload={reload} />
            </Advanced>
          </div>
        </div>
      </div>

      {dirty && (
        <div className="fixed inset-x-0 bottom-16 z-40 flex justify-center px-4 lg:bottom-6 lg:pl-[232px]">
          <div className="flex w-full max-w-xl animate-rise items-center gap-3 rounded-2xl border border-line-strong bg-panel-3/95 px-4 py-3 shadow-[0_20px_60px_-10px_rgb(0_0_0/0.8)] backdrop-blur-xl">
            <span className="size-2 rounded-full bg-warn" aria-hidden />
            <p className="flex-1 text-[13px]">
              <span className="font-medium">Unsaved changes</span>
              <span className="hidden text-muted sm:inline"> · {changes.length ? changes.map((c) => c.label).slice(0, 3).join(", ") : "Disclosure"}{changes.length > 3 ? "…" : ""}</span>
            </p>
            <Button size="sm" variant="ghost" onClick={undo}>Undo</Button>
            <Button size="sm" variant="primary" loading={busy === "save"} onClick={save} disabled={me.role !== "OWNER"} title={me.role !== "OWNER" ? "Only the owner can save" : undefined}>Save</Button>
          </div>
        </div>
      )}
    </div>
  );
}

type PreviewResult = { text: string | null; reply: string | null; isSample: boolean; model: string; provider: string; error?: string; action?: string; explanation?: string; prompt?: any[] };

function Preview({ saved, current, dirty, changes, accountId, sampleLabel, onKeep, onUndo, saving }: { saved: Style; current: Style; dirty: boolean; changes: { label: string; from: string; to: string }[]; accountId: string; sampleLabel: boolean; onKeep: () => void; onUndo: () => void; saving: boolean }) {
  const tour = useTour();
  const [msg, setMsg] = useState(SAMPLE);
  const [draftMsg, setDraftMsg] = useState(SAMPLE);
  const [before, setBefore] = useState<PreviewResult | null>(null);
  const [after, setAfter] = useState<PreviewResult | null>(null);
  const [afterFor, setAfterFor] = useState<string | null>(null);
  const [loading, setLoading] = useState<"before" | "after" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const generate = useCallback(async (style: Style, message: string, showPrompt = false): Promise<PreviewResult> => {
    const r = await post("/api/style", { action: "preview", accountId, data: style, conversation: [{ direction: "INBOUND", body: message }], showPrompt });
    return { text: r.finalText, reply: r.output?.reply ?? null, isSample: r.isSample, model: r.model, provider: r.provider, error: r.error?.message, action: r.output?.action, explanation: r.output?.explanation, prompt: r.prompt };
  }, [accountId]);

  const runBefore = useCallback(async (message: string) => {
    setLoading("before");
    setErr(null);
    try {
      setBefore(await generate(saved, message));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(null);
    }
  }, [generate, saved]);

  useEffect(() => {
    runBefore(msg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msg, JSON.stringify(saved)]);

  const currentKey = JSON.stringify(current) + msg;
  const afterStale = after && afterFor !== currentKey;

  const tryStyle = async () => {
    setLoading("after");
    setErr(null);
    try {
      setAfter(await generate(current, msg));
      setAfterFor(currentKey);
      tour.signal("style-tried");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(null);
    }
  };
  const showCompare = dirty && after;
  const source = before ?? after;

  return (
    <aside className="xl:sticky xl:top-8 xl:col-start-2 xl:row-span-2 xl:row-start-1 xl:self-start">
      <div className="overflow-hidden rounded-2xl border border-line bg-panel">
        <div className="flex items-center justify-between gap-2 border-b border-line px-5 py-3.5">
          <h3 className="flex items-center gap-2 text-[14px] font-semibold">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-ok/60" />
              <span className="relative inline-flex size-2 rounded-full bg-ok" />
            </span>
            Live preview
          </h3>
          {source ? (
            source.isSample ? (
              <span className="flex items-center gap-1 text-[11.5px] text-faint">
                Sample reply
                <InfoTip>No AI model is connected, so built-in example rules write this preview. They follow your settings in a simple way. Connect an AI model (Advanced → AI connection) for natural replies.</InfoTip>
              </span>
            ) : (
              <Badge tone="ok" dot>Your AI · {source.model}</Badge>
            )
          ) : (
            <span className="text-[11.5px] text-faint">{sampleLabel ? "Sample reply" : "Your AI"}</span>
          )}
        </div>

        <div className="space-y-4 px-5 py-5">
          {/* Customer message */}
          <div className="flex items-end gap-2">
            <Avatar name="Taylor" size={28} />
            <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-panel-3 px-3.5 py-2 text-[13.5px] leading-relaxed">{msg}</div>
          </div>

          {showCompare ? (
            <div data-tour="ai-compare" className="animate-rise space-y-3">
              <ReplyBubble label="Before · saved style" r={before} muted />
              <ReplyBubble label="After · with your changes" r={after} stale={!!afterStale} highlight />
              {changes.length > 0 && (
                <div className="rounded-xl bg-panel-2/70 px-3.5 py-3">
                  <p className="text-[11.5px] font-medium text-faint">What you changed</p>
                  <ul className="mt-1.5 flex flex-wrap gap-1.5">
                    {changes.map((c) => (
                      <li key={c.label} className="rounded-full bg-panel-3 px-2.5 py-1 text-[11.5px]">
                        <span className="text-muted">{c.label}:</span> <span className="text-faint line-through decoration-faint/60">{c.from}</span> <ArrowRight className="inline size-3 text-faint" /> <span className="text-accent-strong">{c.to}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="primary" onClick={onKeep} loading={saving}><Check className="size-3.5" /> Keep this style</Button>
                <Button size="sm" onClick={onUndo}><RotateCcw className="size-3.5" /> Undo changes</Button>
                <Button size="sm" variant="ghost" onClick={tryStyle} loading={loading === "after"}><RefreshCw className="size-3.5" /> Try again</Button>
              </div>
            </div>
          ) : (
            <ReplyBubble label={dirty ? "Saved style (before your changes)" : "Your AI would reply"} r={before} loading={loading === "before"} />
          )}

          {err && <p className="text-xs text-danger">{humanize(err).message}</p>}

          {!showCompare && (
            <Button data-tour="ai-try" variant={dirty ? "primary" : "secondary"} className="w-full" onClick={dirty ? tryStyle : () => runBefore(msg)} loading={loading === "after" || (!dirty && loading === "before")}>
              {dirty ? <><Wand2 className="size-4" /> Try this style</> : <><RefreshCw className="size-4" /> Write another version</>}
            </Button>
          )}
          {showCompare && afterStale && (
            <Button data-tour="ai-try" variant="primary" className="w-full" onClick={tryStyle} loading={loading === "after"}>
              <Wand2 className="size-4" /> Try this style
            </Button>
          )}
        </div>

        <form
          className="border-t border-line px-5 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (draftMsg.trim()) {
              setAfter(null);
              setMsg(draftMsg.trim());
            }
          }}
        >
          <label htmlFor="preview-msg" className="flex items-center gap-1.5 text-[12.5px] font-medium text-muted">
            <MessageCircle className="size-3.5" /> Test with your own customer message
          </label>
          <div className="mt-2 flex gap-2">
            <Input id="preview-msg" value={draftMsg} onChange={(e) => setDraftMsg(e.target.value)} placeholder="Type what a customer might say…" maxLength={500} />
            <Button type="submit" size="md" disabled={!draftMsg.trim() || draftMsg.trim() === msg}>Test</Button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {["when do you post?", "how much is the autumn hike set?", "are you a bot?", "thanks!!"].map((q) => (
              <button key={q} type="button" onClick={() => { setDraftMsg(q); setAfter(null); setMsg(q); }} className="rounded-full border border-line px-2.5 py-1 text-[11.5px] text-muted hover:border-line-strong hover:text-fg">
                {q}
              </button>
            ))}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-faint">Previews never reach customers. With a real AI model connected, each preview counts toward your daily AI spending limit.</p>
          {source?.prompt === undefined && (
            <TechDetails label="See exactly what the AI receives">
              <PromptPeek generate={() => generate(current, msg, true)} />
            </TechDetails>
          )}
        </form>
      </div>
    </aside>
  );
}

function PromptPeek({ generate }: { generate: () => Promise<PreviewResult> }) {
  const [p, setP] = useState<any[] | null>(null);
  return p ? (
    <pre className="max-h-80 overflow-auto whitespace-pre-wrap text-[10.5px]">{p.map((m: any) => `## ${m.role}\n${m.content}`).join("\n\n")}</pre>
  ) : (
    <button type="button" className="text-accent hover:underline" onClick={async () => setP((await generate()).prompt ?? [])}>Load the instructions for the current settings</button>
  );
}

function ReplyBubble({ label, r, loading, muted, highlight, stale }: { label: string; r: PreviewResult | null; loading?: boolean; muted?: boolean; highlight?: boolean; stale?: boolean }) {
  const body = r?.reply;
  const disclosure = r?.text && body ? r.text.slice(body.length).trim() : "";
  return (
    <div className={cn("flex flex-col items-end", stale && "opacity-60")}>
      <p className="mb-1.5 flex items-center gap-1.5 text-[11.5px] font-medium text-faint">
        {highlight && <Sparkles className="size-3 text-accent" aria-hidden />}
        {label}
        {stale && <span className="text-warn">· settings changed, try again</span>}
      </p>
      {loading || !r ? (
        <div className="w-4/5 space-y-2 rounded-2xl rounded-br-md bg-accent/10 px-3.5 py-3" aria-label="Writing…">
          <div className="skeleton h-2.5 w-full rounded-full" />
          <div className="skeleton h-2.5 w-2/3 rounded-full" />
        </div>
      ) : body ? (
        <div className={cn("max-w-[90%] animate-pop rounded-2xl rounded-br-md px-3.5 py-2 text-[13.5px] leading-relaxed", muted ? "bg-panel-3 text-fg/80" : "bg-accent text-accent-ink", highlight && "shadow-[0_8px_30px_-10px_var(--color-accent)]")}>
          {body}
          {disclosure && <span className={cn("mt-1.5 block text-[11px]", muted ? "text-faint" : "text-accent-ink/60")}>+ {disclosure}</span>}
        </div>
      ) : (
        <div className="max-w-[90%] rounded-xl border border-dashed border-line px-3.5 py-2 text-[12.5px] text-muted">
          {r.error ? humanize(r.error).message : r.action === "HANDOFF" ? "The AI would pass this message to you instead of replying." : r.action === "WAIT" ? "The AI thinks no reply is needed." : "No reply."}
          {r.explanation && <span className="mt-1 block text-[11px] text-faint">{r.explanation}</span>}
        </div>
      )}
    </div>
  );
}

function ListEditor({ label, items, onChange, placeholder, max }: { label: string; items: string[]; onChange: (v: string[]) => void; placeholder: string; max: number }) {
  const [v, setV] = useState("");
  const add = () => {
    const t = v.trim();
    if (!t || items.length >= max) return;
    onChange([...items, t]);
    setV("");
  };
  return (
    <div>
      <p className="mb-2 text-[13px] font-medium">{label}</p>
      <ul className="space-y-1.5">
        {items.map((it, i) => (
          <li key={i} className="group flex items-center gap-2 rounded-lg border border-line bg-panel-2/40 pr-1 transition-colors focus-within:border-accent">
            <input aria-label={`${label} ${i + 1}`} value={it} onChange={(e) => onChange(items.map((x, k) => (k === i ? e.target.value : x)))} onBlur={(e) => !e.target.value.trim() && onChange(items.filter((_, k) => k !== i))} className="min-w-0 flex-1 bg-transparent px-3 py-2 text-[13px] focus:outline-none" />
            <button type="button" aria-label="Remove" onClick={() => onChange(items.filter((_, k) => k !== i))} className="rounded-md p-1.5 text-faint opacity-60 hover:bg-panel-3 hover:text-danger group-hover:opacity-100">
              <Trash2 className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <Input aria-label={`Add to ${label}`} value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} />
        <Button type="submit" size="md" disabled={!v.trim()}><Plus className="size-3.5" /> Add</Button>
      </form>
    </div>
  );
}

function ChipEditor({ label, hint, items, onChange, placeholder, tone }: { label: string; hint: string; items: string[]; onChange: (v: string[]) => void; placeholder: string; tone?: "danger" }) {
  const [v, setV] = useState("");
  return (
    <div>
      <p className="text-[13px] font-medium">{label}</p>
      <p className="mb-2.5 text-xs text-faint">{hint}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((it, i) => (
          <span key={i} className={cn("inline-flex items-center gap-1 rounded-full py-1 pl-2.5 pr-1 text-[12.5px]", tone === "danger" ? "bg-danger/10 text-danger" : "bg-accent/12 text-accent-strong")}>
            {it}
            <button type="button" aria-label={`Remove ${it}`} onClick={() => onChange(items.filter((_, k) => k !== i))} className="rounded-full p-0.5 opacity-70 hover:bg-black/20 hover:opacity-100">
              <X className="size-3" />
            </button>
          </span>
        ))}
        <form onSubmit={(e) => { e.preventDefault(); const t = v.trim(); if (t && !items.includes(t)) onChange([...items, t.slice(0, 80)]); setV(""); }}>
          <input aria-label={`Add to ${label}`} value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} className="h-7 w-36 rounded-full border border-dashed border-line-strong bg-transparent px-3 text-[12.5px] placeholder:text-faint focus:border-accent focus:outline-none" />
        </form>
      </div>
    </div>
  );
}

function ExamplesEditor({ items, onChange }: { items: Style["goodExamples"]; onChange: (v: Style["goodExamples"]) => void }) {
  const set = (i: number, patch: Partial<Style["goodExamples"][number]>) => onChange(items.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  return (
    <div className="space-y-3">
      {items.map((e, i) => (
        <div key={i} className="group relative rounded-xl border border-line bg-panel-2/30 p-3">
          <div className="grid gap-2 md:grid-cols-2">
            <label className="block">
              <span className="text-[11.5px] text-faint">When a customer says…</span>
              <Textarea value={e.customer} onChange={(ev) => set(i, { customer: ev.target.value })} className="mt-1 min-h-14" />
            </label>
            <label className="block">
              <span className="text-[11.5px] text-faint">You'd reply…</span>
              <Textarea value={e.reply} onChange={(ev) => set(i, { reply: ev.target.value })} className="mt-1 min-h-14" />
            </label>
          </div>
          <button type="button" aria-label="Remove example" onClick={() => onChange(items.filter((_, k) => k !== i))} className="absolute right-2 top-2 rounded-md p-1 text-faint opacity-0 hover:text-danger focus:opacity-100 group-hover:opacity-100">
            <Trash2 className="size-3.5" />
          </button>
        </div>
      ))}
      <Button size="sm" disabled={items.length >= 20} onClick={() => onChange([...items, { customer: "", reply: "" }])}>
        <Plus className="size-3.5" /> Add an example
      </Button>
    </div>
  );
}

function Versions({ d, reload, canEdit }: { d: any; reload: () => void; canEdit: boolean }) {
  const { run } = useAction();
  if (d.versions.length === 0) return <p className="text-[13px] text-muted">No saved versions yet.</p>;
  return (
    <ul className="divide-y divide-line">
      {d.versions.map((v: any) => (
        <li key={v.version} className="flex items-center justify-between gap-3 py-2.5 text-[13px]">
          <span className="min-w-0">
            <span className="font-medium">Version {v.version}</span> {v.active && <Badge tone="ok">In use</Badge>}
            <span className="block truncate text-xs text-muted">{v.changeNote} · {ago(v.createdAt)}</span>
          </span>
          {!v.active && canEdit && (
            <Button size="xs" onClick={() => run("act", () => post("/api/style", { action: "activate", accountId: d.account.id, version: v.version }).then(reload), `Now using version ${v.version}`)}>Use this version</Button>
          )}
        </li>
      ))}
    </ul>
  );
}
