"use client";
import Link from "next/link";
import { useState } from "react";
import { Badge, Button, Card, ErrorBox, Field, Input, Loading, Notice, PageHeader, Select, useAction } from "@/components/ui";
import { ago, post, useApi } from "@/lib/client";

const SCENARIO_HELP: Record<string, string> = {
  burst: "3 quick messages, debounced into one draft",
  high_interest: "Direct purchase question → intent + prioritized handoff",
  price_question: "Price question answered from confirmed catalog",
  subscription: "Support question answered from approved facts",
  ai_question: "“Are you a bot?”, answered honestly",
  human_request: "Asks for a person → handoff + pause",
  explicit: "Out-of-scope request → handoff, no AI reply",
  billing: "Billing dispute → urgent handoff",
  injection: "Prompt-injection attempt (treated as data)",
  decline: "Declines → outcome + offer suppression",
  thanks: "Short thanks → brief acknowledgement",
  smalltalk: "Light conversation grounded in facts",
};

export default function SimulatorPage() {
  const { data, error, loading, reload } = useApi<any>("/api/simulator", { poll: 5000 });
  const { busy, run } = useAction();
  const [chat, setChat] = useState("");
  const [text, setText] = useState("");
  const [last, setLast] = useState<any>(null);
  const [cust, setCust] = useState("");
  const [item, setItem] = useState("");
  const catalog = useApi<any>("/api/catalog");
  const customers = useApi<any>("/api/customers");
  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorBox error={error} retry={reload} />;
  const call = (key: string, body: object, ok: string) => run(key, async () => { const r = await post("/api/simulator", body); setLast(r); reload(); return r; }, ok);
  const target = chat || undefined;
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader title="Simulator" description="No real credentials, no real customers. Simulated events go through the same signed-webhook → ingest → queue → dispatch code as production, with a simulated provider at the edge that performs no network calls." />
      <Notice>Everything here is fictional and labelled <Badge tone="accent">Simulator</Badge>. Simulator data can never reach a live send endpoint: simulated accounts are hard-wired to the simulated provider.</Notice>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Incoming messages" description="Send to an existing simulated chat, or leave blank to create a new fan.">
          <Field label="Target chat">{(id) => <Select id={id} value={chat} onChange={(e) => setChat(e.target.value)} options={[{ value: "", label: "New simulated fan" }, ...data.chats.map((c: any) => ({ value: c.chatId, label: c.name }))]} />}</Field>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {data.scenarios.map((s: string) => (
              <button key={s} disabled={!!busy} onClick={() => call(s, { action: "scenario", scenario: s, chatId: target }, `Scenario “${s}” delivered`)} className="rounded-md border border-line p-2 text-left hover:border-accent disabled:opacity-50">
                <p className="text-[13px] font-medium">{s.replace(/_/g, " ")}</p>
                <p className="text-[11px] text-muted">{SCENARIO_HELP[s]}</p>
              </button>
            ))}
          </div>
          <form className="mt-3 flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (chat && text) call("msg", { action: "message", chatId: chat, text }, "Message delivered").then(() => setText("")); }}>
            <Field label="Custom message (pick a chat above)">{(id) => <Input id={id} value={text} onChange={(e) => setText(e.target.value)} disabled={!chat} />}</Field>
            <Button type="submit" disabled={!chat || !text}>Send as fan</Button>
          </form>
        </Card>
        <Card title="Failures & edge cases">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button disabled={!chat} onClick={() => call("dup", { action: "duplicate", chatId: chat }, "Duplicate webhook test done")}>Duplicate webhook</Button>
              <Button disabled={!chat} onClick={() => call("ooo", { action: "out_of_order", chatId: chat }, "Out-of-order delivery done")}>Out-of-order messages</Button>
              <Button onClick={() => call("sig", { action: "bad_signature" }, "Bad signature attempted")}>Bad webhook signature</Button>
            </div>
            <Field label={`Next provider send result (current: ${data.state.nextSendFailure ?? "normal"})`}>
              {(id) => <Select id={id} value={data.state.nextSendFailure ?? ""} onChange={(e) => call("sf", { action: "send_failure", failure: e.target.value || null }, "Next send behaviour set")} options={[{ value: "", label: "Normal (accepted)" }, { value: "timeout_delivered", label: "Timeout, but delivered → reconciled" }, { value: "timeout_lost", label: "Timeout, lost → human review" }, { value: "rejected", label: "Rejected (422)" }, { value: "rate_limited", label: "Rate limited (429) → retry" }]} />}
            </Field>
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => call("ai", { action: "ai_fail", n: 2 }, "Next AI call will return malformed output (twice)")}>Next AI call fails</Button>
              <span className="text-xs text-muted">pending AI failures: {data.state.aiFailNext}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary" onClick={() => call("ff", { action: "fast_forward" }, "Simulated waits skipped")}>Skip waits (simulator only)</Button>
              <span className="text-xs text-muted">Makes pending debounce/pacing jobs for simulated chats due now.</span>
            </div>
            <p className="text-xs text-muted">Takeover: open any chat in the <Link className="text-accent hover:underline" href="/inbox">Inbox</Link> and press Take over / Resume.</p>
          </div>
        </Card>
        <Card title="Simulated purchase" description="Creates a verified simulated transaction (excluded from real sales figures).">
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Customer">{(id) => <Select id={id} value={cust} onChange={(e) => setCust(e.target.value)} options={[{ value: "", label: "Choose…" }, ...(customers.data?.customers ?? []).filter((c: any) => c.isSimulated).map((c: any) => ({ value: c.id, label: c.name }))]} />}</Field>
            <Field label="Item">{(id) => <Select id={id} value={item} onChange={(e) => setItem(e.target.value)} options={[{ value: "", label: "Choose…" }, ...(catalog.data?.items ?? []).map((i: any) => ({ value: i.id, label: i.title }))]} />}</Field>
            <Button disabled={!cust || !item} onClick={() => call("buy", { action: "purchase", customerId: cust, catalogItemId: item }, "Simulated purchase recorded")}>Record</Button>
          </div>
        </Card>
        <Card title="What the simulated provider accepted" actions={<Button size="sm" variant="danger" onClick={() => confirm("Delete all simulated chats and reseed?") && call("reset", { action: "reset" }, "Simulator reset")}>Reset simulator</Button>}>
          {data.sent.length === 0 ? <p className="text-xs text-muted">Nothing sent yet.</p> : (
            <ul className="space-y-1 text-xs">{data.sent.map((s: any) => <li key={s.id}><span className="text-faint">{ago(s.createdAt)} · {s.externalChatId}:</span> {s.body.slice(0, 90)}</li>)}</ul>
          )}
        </Card>
      </div>
      {last && (
        <Card title="Last result (raw)">
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-[11px] text-muted">{JSON.stringify(last, null, 2)}</pre>
          {last.conversationId && <Link className="mt-2 inline-block text-xs text-accent hover:underline" href={`/inbox?c=${last.conversationId}`}>Open this conversation →</Link>}
        </Card>
      )}
    </div>
  );
}
