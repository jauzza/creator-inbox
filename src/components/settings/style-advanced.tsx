"use client";
import { useEffect, useState } from "react";
import { Badge, Button, Card, ErrorBox, Field, Input, Loading, Notice, PageHeader, Select, Switch, Table, Tabs, Textarea, useAction } from "@/components/ui";
import { ago, post, usd, useApi } from "@/lib/client";

const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

function StylePage() {
  const { data, error, loading, reload } = useApi<any>("/api/style");
  const [tab, setTab] = useState<"pack" | "preview" | "workbench" | "experiment">("pack");
  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorBox error={error} retry={reload} />;
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader title="Creator style" description={`Approved facts, writing examples, tone and boundaries for ${data.account.name}. Creator-written material only; platform conversations are never used for training. Prompt ${data.promptVersion}.`} />
      <Tabs tabs={[{ id: "pack", label: "Style pack" }, { id: "preview", label: "Preview playground" }, { id: "workbench", label: "Reply-quality workbench" }, { id: "experiment", label: "Experiment" }]} value={tab} onChange={setTab} />
      {tab === "pack" && <Pack d={data} reload={reload} />}
      {tab === "preview" && <Preview d={data} />}
      {tab === "workbench" && <Workbench />}
      {tab === "experiment" && <Experiment d={data} reload={reload} />}
    </div>
  );
}

export function Pack({ d, reload }: { d: any; reload: () => void }) {
  const [s, setS] = useState<any>(d.active.data);
  const [disclosure, setDisclosure] = useState(d.account.disclosureText);
  const [note, setNote] = useState("");
  const { busy, run } = useAction();
  useEffect(() => setS(d.active.data), [d.active.data]);
  const set = (k: string, v: any) => setS((p: any) => ({ ...p, [k]: v }));
  const exText = (arr: any[]) => arr.map((e) => `${e.customer} => ${e.reply}${e.note ? ` # ${e.note}` : ""}`).join("\n");
  const parseEx = (t: string) =>
    lines(t).map((l) => {
      const [customer, rest = ""] = l.split("=>");
      const [reply, note] = rest.split(" # ");
      return { customer: customer.trim(), reply: (reply ?? "").trim(), ...(note ? { note: note.trim() } : {}) };
    });
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Approved facts & boundaries" description="The AI may only state these facts. One per line.">
        <div className="space-y-3">
          <Field label="Creator display name">{(id) => <Input id={id} value={s.creatorName} onChange={(e) => set("creatorName", e.target.value)} />}</Field>
          <Field label="Public facts">{(id) => <Textarea id={id} className="min-h-28" value={s.publicFacts.join("\n")} onChange={(e) => set("publicFacts", lines(e.target.value))} />}</Field>
          <Field label="Boundaries">{(id) => <Textarea id={id} value={s.boundaries.join("\n")} onChange={(e) => set("boundaries", lines(e.target.value))} />}</Field>
          <Field label="Customer-facing AI disclosure" hint="Added according to Automation → disclosure settings. Never removed by the AI.">{(id) => <Textarea id={id} value={disclosure} onChange={(e) => setDisclosure(e.target.value)} />}</Field>
        </div>
      </Card>
      <Card title="Tone controls">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tone preset">{(id) => <Select id={id} value={s.tone} onChange={(e) => set("tone", e.target.value)} options={["warm", "playful", "confident", "concise", "professional"].map((v) => ({ value: v, label: v }))} />}</Field>
          <Field label={`Formality: ${s.formality}`}>{(id) => <input id={id} type="range" min={0} max={100} value={s.formality} onChange={(e) => set("formality", Number(e.target.value))} className="w-full accent-[var(--color-accent)]" />}</Field>
          <Field label="Emoji">{(id) => <Select id={id} value={s.emoji} onChange={(e) => set("emoji", e.target.value)} options={["none", "rare", "some", "often"].map((v) => ({ value: v, label: v }))} />}</Field>
          <Field label="Reply length">{(id) => <Select id={id} value={s.replyLength} onChange={(e) => set("replyLength", e.target.value)} options={["short", "medium", "long"].map((v) => ({ value: v, label: v }))} />}</Field>
          <Field label="Language">{(id) => <Input id={id} value={s.language} onChange={(e) => set("language", e.target.value)} />}</Field>
          <div className="space-y-2 pt-5">
            {[["lowercase", "Mostly lowercase"], ["contractions", "Contractions"], ["casualPunctuation", "Casual punctuation"]].map(([k, l]) => (
              <div key={k} className="flex items-center justify-between text-[13px]">{l}<Switch label={l} checked={s[k]} onChange={(v) => set(k, v)} /></div>
            ))}
          </div>
        </div>
        <div className="mt-3 space-y-3">
          <Field label="Preferred expressions (one per line)">{(id) => <Textarea id={id} value={s.preferredExpressions.join("\n")} onChange={(e) => set("preferredExpressions", lines(e.target.value))} />}</Field>
          <Field label="Phrases to avoid (one per line)">{(id) => <Textarea id={id} value={s.avoidPhrases.join("\n")} onChange={(e) => set("avoidPhrases", lines(e.target.value))} />}</Field>
        </div>
      </Card>
      <Card title="Writing examples" description="Format: customer text => good reply. 3–5 relevant examples are picked per message." className="lg:col-span-2">
        <div className="grid gap-3 lg:grid-cols-2">
          <Field label="Good examples">{(id) => <Textarea id={id} className="min-h-36 font-mono text-xs" defaultValue={exText(s.goodExamples)} onBlur={(e) => set("goodExamples", parseEx(e.target.value))} />}</Field>
          <Field label="Bad examples (append  # why)">{(id) => <Textarea id={id} className="min-h-36 font-mono text-xs" defaultValue={exText(s.badExamples)} onBlur={(e) => set("badExamples", parseEx(e.target.value))} />}</Field>
        </div>
      </Card>
      <Card title="Versions" description="Each save creates a new version. Edits in the inbox are never promoted here automatically." className="lg:col-span-2">
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <Field label="Change note">{(id) => <Input id={id} value={note} onChange={(e) => setNote(e.target.value)} className="w-80" placeholder="e.g. fewer emoji, added schedule fact" />}</Field>
          <Button variant="primary" loading={busy === "save"} onClick={() => run("save", () => post("/api/style", { action: "save", accountId: d.account.id, data: s, changeNote: note || "Updated", disclosureText: disclosure }).then(reload), (r: any) => `Saved as version ${r.version}`)}>Save new version</Button>
        </div>
        <ul className="divide-y divide-line">
          {d.versions.map((v: any) => (
            <li key={v.version} className="flex items-center justify-between py-2 text-[13px]">
              <span>v{v.version} {v.active && <Badge tone="ok">active</Badge>} <span className="text-muted">{v.changeNote}</span> <span className="text-faint">{ago(v.createdAt)}</span></span>
              {!v.active && <Button size="sm" variant="ghost" onClick={() => run("act", () => post("/api/style", { action: "activate", accountId: d.account.id, version: v.version }).then(reload), `Rolled back to v${v.version}`)}>Activate</Button>}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

export function Preview({ d }: { d: any }) {
  const [convo, setConvo] = useState("customer: hey! how much is the autumn hike set?\ncustomer: and when do you post new ones?");
  const [showPrompt, setShowPrompt] = useState(false);
  const [res, setRes] = useState<any>(null);
  const { busy, run } = useAction();
  const parse = () => lines(convo).map((l) => ({ direction: /^(creator|team|you):/i.test(l) ? "OUTBOUND" : "INBOUND", body: l.replace(/^\w+:\s*/, "") }));
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Test conversation" description="Prefix lines with customer: or creator:. Uses the ACTIVE style version and the configured AI provider; counts toward the AI budget.">
        <Textarea aria-label="Test conversation" className="min-h-40 font-mono text-xs" value={convo} onChange={(e) => setConvo(e.target.value)} />
        <div className="mt-2 flex items-center gap-3">
          <Button variant="primary" loading={busy === "p"} onClick={() => run("p", async () => setRes(await post("/api/style", { action: "preview", accountId: d.account.id, data: d.active.data, conversation: parse(), showPrompt })))}>Generate preview</Button>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={showPrompt} onChange={(e) => setShowPrompt(e.target.checked)} /> show the exact prompt sent</label>
        </div>
      </Card>
      <Card title="Result">
        {!res ? <p className="text-xs text-muted">Run a preview to see the draft, the chosen next action and which settings were applied.</p> : (
          <div className="space-y-3 text-[13px]">
            <p className="text-xs text-muted">{res.provider} · {res.model} · {res.latencyMs} ms · {res.tokens.in + res.tokens.out} tokens · {usd(res.costMicros)}{res.rewriteCount ? " · 1 rewrite" : ""}</p>
            {res.error && <Notice tone="danger">{res.error.message}</Notice>}
            {res.output && (
              <>
                <p><Badge>{res.output.action}</Badge> <span className="text-xs text-muted">{res.output.explanation}</span></p>
                {res.finalText && <div className="whitespace-pre-wrap rounded-md bg-accent/10 p-3">{res.finalText}</div>}
                {res.issues.length > 0 && <ul className="text-xs">{res.issues.map((i: any, k: number) => <li key={k} className={i.severity === "block" ? "text-danger" : "text-warn"}>{i.code}: {i.detail}</li>)}</ul>}
              </>
            )}
            <div className="rounded-md border border-line p-2 text-xs text-muted">
              <p className="mb-1 font-medium text-fg">Settings applied</p>
              tone {res.applied.tone} · formality {res.applied.formality} · emoji {res.applied.emoji} · length {res.applied.length} · {res.applied.lowercase ? "lowercase" : "normal case"} · {res.applied.contractions ? "contractions" : "no contractions"} · language {res.applied.language} · {res.applied.examplesUsed} examples · disclosure {res.applied.disclosure.mode.replace(/_/g, " ")} + “{res.applied.disclosure.tag}”
            </div>
            {res.prompt && <details><summary className="cursor-pointer text-xs text-accent">Prompt</summary><pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded bg-bg p-2 text-[11px] text-muted">{res.prompt.map((m: any) => `## ${m.role}\n${m.content}`).join("\n\n")}</pre></details>}
          </div>
        )}
      </Card>
    </div>
  );
}

export function Workbench() {
  const { data, error, reload } = useApi<any>("/api/evals", { poll: 5000 });
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const cmp = useApi<any>(a && b && a !== b ? `/api/evals?a=${a}&b=${b}` : null);
  const { busy, run } = useAction();
  if (error) return <ErrorBox error={error} retry={reload} />;
  if (!data) return <Loading />;
  return (
    <div className="space-y-4">
      <Card title={`Evaluation set: ${data.caseCount} synthetic non-explicit cases`} description="Kept separate from prompt examples. Auto-checks: expected next action, forbidden phrases (invented facts, pressure, denial of automation), errors. Compare runs blind; names are hidden in review." actions={<>
        <Button size="sm" variant="ghost" onClick={() => run("rs", () => post("/api/evals", { action: "reseed" }).then(reload), "Cases reseeded")}>Reseed cases</Button>
        <Button size="sm" variant="primary" loading={busy === "run"} onClick={() => run("run", () => post("/api/evals", { action: "run", slot: "primary" }).then(reload), "Run queued (the worker processes it)")}>Run primary model</Button>
        <Button size="sm" loading={busy === "run2"} onClick={() => run("run2", () => post("/api/evals", { action: "run", slot: "alternate" }).then(reload), "Alternate run queued")}>Run alternate</Button>
      </>}>
        {data.runs.length === 0 ? <p className="text-xs text-muted">No runs yet. With the offline simulator AI, a run checks the pipeline, not writing quality.</p> : (
          <Table head={["Run", "Status", "Action accuracy", "Forbidden hits", "Errors", "Avg latency", "Tokens / cost", "Reviewed"]}>
            {data.runs.map((r: any) => (
              <tr key={r.id}>
                <td className="px-3 py-2 text-xs">{r.label}<p className="text-faint">{r.model} · {r.promptVersion}{r.styleVersion ? ` · style v${r.styleVersion}` : ""}</p></td>
                <td className="px-3 py-2 text-xs">{r.status}</td>
                <td className="px-3 py-2 tabular-nums">{r.summary.actionAccuracy == null ? "—" : `${Math.round(r.summary.actionAccuracy * 100)}%`} <span className="text-[11px] text-faint">n={r.summary.cases}</span></td>
                <td className="px-3 py-2 tabular-nums">{r.summary.forbiddenHits}</td>
                <td className="px-3 py-2 tabular-nums">{r.summary.errors}</td>
                <td className="px-3 py-2 tabular-nums">{r.summary.avgLatencyMs} ms</td>
                <td className="px-3 py-2 text-xs tabular-nums">{r.summary.tokens} / {usd(r.summary.costMicros)}</td>
                <td className="px-3 py-2 text-xs">{r.summary.reviewed}{r.summary.avgReviewerScore != null && ` · avg ${r.summary.avgReviewerScore.toFixed(1)}`}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      <Card title="Blind comparison" description="Pick two runs. Replies are shown as Reply 1 / Reply 2 without model or prompt names; score 1–5 and mark a preference.">
        <div className="mb-3 flex flex-wrap gap-2">
          {[[a, setA], [b, setB]].map(([v, set]: any, i) => (
            <Select key={i} aria-label={`Run ${i + 1}`} className="w-64" value={v} onChange={(e) => set(e.target.value)} options={[{ value: "", label: `Choose run ${i + 1}` }, ...data.runs.map((r: any, k: number) => ({ value: r.id, label: `Run #${data.runs.length - k} (${new Date(r.createdAt).toLocaleString()})` }))]} />
          ))}
        </div>
        {cmp.data?.compare?.length === 0 && <p className="text-xs text-muted">These runs have no overlapping finished cases yet.</p>}
        <div className="space-y-3">
          {cmp.data?.compare?.slice(0, 40).map((c: any) => (
            <div key={c.caseId} className="rounded-md border border-line p-3">
              <p className="text-[11px] uppercase tracking-wider text-faint">{c.category}</p>
              <div className="my-1 space-y-0.5 text-xs">{c.transcript.map((m: any, i: number) => <p key={i} className={m.direction === "INBOUND" ? "" : "text-muted"}>{m.direction === "INBOUND" ? "Customer" : "Team"}: {m.body}</p>)}</div>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                {c.candidates.map((x: any) => (
                  <div key={x.resultId} className={`rounded border p-2 text-xs ${x.preferred ? "border-accent" : "border-line"}`}>
                    <p className="font-medium">{x.slot} <Badge>{x.action ?? "error"}</Badge> {!x.autoChecks?.actionOk && <Badge tone="warn">unexpected action</Badge>} {!!x.autoChecks?.forbidden?.length && <Badge tone="danger">forbidden: {x.autoChecks.forbidden.join(", ")}</Badge>}</p>
                    <p className="mt-1 whitespace-pre-wrap">{x.body || x.error || <span className="text-faint">(no reply)</span>}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-1">
                      {[1, 2, 3, 4, 5].map((n) => <button key={n} aria-label={`Score ${n}`} onClick={() => run("rv", () => post("/api/evals", { action: "review", resultId: x.resultId, score: n, preferred: x.preferred }).then(cmp.reload))} className={`size-6 rounded border text-[11px] ${x.reviewerScore === n ? "border-accent text-accent" : "border-line-strong text-muted"}`}>{n}</button>)}
                      <Button size="sm" variant={x.preferred ? "primary" : "ghost"} onClick={() => run("rv", () => post("/api/evals", { action: "review", resultId: x.resultId, score: x.reviewerScore, preferred: true }).then(cmp.reload))}>Prefer</Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

export function Experiment({ d, reload }: { d: any; reload: () => void }) {
  const e = d.experiment;
  const [enabled, setEnabled] = useState(!!e?.enabled);
  const [key, setKey] = useState(e?.key ?? "style-test-1");
  const [va, setVa] = useState(String(e?.variants?.A ?? d.versions[1]?.version ?? 1));
  const [vb, setVb] = useState(String(e?.variants?.B ?? d.versions[0]?.version ?? 1));
  const { busy, run } = useAction();
  return (
    <Card title="Customer-level A/B (style versions)" description="Each customer is assigned a stable variant from a hash, so one customer never sees competing variants in a conversation. Keep pricing, catalog and operator coverage comparable. Results appear in Analytics with sample sizes; a handful of sales is not evidence.">
      <div className="grid max-w-xl gap-3">
        <div className="flex items-center justify-between text-[13px]">Experiment enabled <Switch label="Experiment enabled" checked={enabled} onChange={setEnabled} /></div>
        <Field label="Experiment key" hint="Changing the key re-randomises assignments">{(id) => <Input id={id} value={key} onChange={(ev) => setKey(ev.target.value)} />}</Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Variant A → style version">{(id) => <Select id={id} value={va} onChange={(ev) => setVa(ev.target.value)} options={d.versions.map((v: any) => ({ value: String(v.version), label: `v${v.version}` }))} />}</Field>
          <Field label="Variant B → style version">{(id) => <Select id={id} value={vb} onChange={(ev) => setVb(ev.target.value)} options={d.versions.map((v: any) => ({ value: String(v.version), label: `v${v.version}` }))} />}</Field>
        </div>
        {va === vb && enabled && <Notice tone="warn">Both variants use the same version: this is an A/A test (useful to check noise).</Notice>}
        <Button variant="primary" loading={busy === "x"} onClick={() => run("x", () => post("/api/style", { action: "experiment", enabled, key, variants: { A: Number(va), B: Number(vb) } }).then(reload), "Experiment saved")}>Save experiment</Button>
      </div>
    </Card>
  );
}
