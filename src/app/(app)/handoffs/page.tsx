"use client";
import Link from "next/link";
import { useState } from "react";
import { Badge, Button, Dialog, Empty, ErrorBox, Input, Loading, PageHeader, SimBadge, Table, Tabs, useAction } from "@/components/ui";
import { ago, post, useApi } from "@/lib/client";

export default function HandoffsPage() {
  const [tab, setTab] = useState<"open" | "resolved">("open");
  const { data, error, loading, reload } = useApi<any[]>(`/api/handoffs?status=${tab}`, { poll: 8000 });
  const { busy, run } = useAction();
  const [resolving, setResolving] = useState<any | null>(null);
  const [outcome, setOutcome] = useState("");
  const [useful, setUseful] = useState<boolean | null>(null);
  const call = (id: string, body: object, ok: string) => run(id, () => post(`/api/handoffs/${id}`, body).then(reload), ok);

  return (
    <div className="mx-auto max-w-6xl space-y-3">
      <PageHeader title="Handoffs" description="Conversations the AI must not handle, sorted by priority then age. Customer message bodies stay inside the dashboard; external alerts carry only a link." />
      <Tabs tabs={[{ id: "open", label: "Open" }, { id: "resolved", label: "Resolved" }]} value={tab} onChange={setTab} />
      {loading && !data && <Loading />}
      {error && <ErrorBox error={error} retry={reload} />}
      {data?.length === 0 && <Empty title={tab === "open" ? "No open handoffs" : "Nothing resolved yet"}>Try the “human_request” or “billing” scenario in the Simulator.</Empty>}
      {!!data?.length && (
        <Table head={["Priority", "Reason", "Customer", "Age", "Owner", tab === "open" ? "" : "Outcome"]}>
          {data.map((h) => (
            <tr key={h.id} className="align-top">
              <td className="px-3 py-2">
                <Badge tone={h.priority >= 80 ? "danger" : h.priority >= 60 ? "warn" : "neutral"}>{h.priority}</Badge>
              </td>
              <td className="px-3 py-2">
                <p className="font-medium">{h.label}</p>
                {h.evidence && <p className="text-xs text-muted">“{h.evidence}”</p>}
              </td>
              <td className="px-3 py-2">
                <span className="flex items-center gap-1.5">{h.customer} {h.isSimulated && <SimBadge />}</span>
                <span className="text-[11px] text-faint">{h.account}</span>
              </td>
              <td className="px-3 py-2 text-xs text-muted">{ago(h.createdAt)}</td>
              <td className="px-3 py-2 text-xs">{h.owner ?? <span className="text-faint">unclaimed</span>}</td>
              <td className="px-3 py-2">
                {tab === "open" ? (
                  <div className="flex flex-wrap gap-1.5">
                    <Link href={`/inbox?c=${h.conversationId}`} className="inline-flex h-7 items-center rounded-md bg-accent px-2.5 text-[13px] font-medium text-[#06231d] hover:bg-accent-strong">Open chat</Link>
                    {h.status === "OPEN" ? (
                      <Button size="sm" loading={busy === h.id} onClick={() => call(h.id, { action: "claim" }, "Claimed")}>Claim</Button>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => call(h.id, { action: "release" }, "Released")}>Release</Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => { setResolving(h); setOutcome(""); setUseful(null); }}>Resolve</Button>
                  </div>
                ) : (
                  <span className="text-xs">{h.outcome} {h.useful != null && <Badge tone={h.useful ? "ok" : "neutral"}>{h.useful ? "useful" : "not useful"}</Badge>}</span>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}
      <Dialog
        open={!!resolving}
        onClose={() => setResolving(null)}
        title="Resolve handoff"
        footer={
          <>
            <Button variant="ghost" onClick={() => setResolving(null)}>Cancel</Button>
            <Button variant="primary" disabled={!outcome.trim()} onClick={() => { call(resolving.id, { action: "resolve", outcome, useful }, "Resolved"); setResolving(null); }}>Resolve</Button>
          </>
        }
      >
        <p className="text-xs text-muted">Resolving doesn't resume automation. If the chat was paused, resume it from the conversation when you're ready.</p>
        <Input aria-label="Outcome" placeholder="What happened? e.g. refunded, answered personally" value={outcome} onChange={(e) => setOutcome(e.target.value)} />
        <div className="flex items-center gap-2 text-xs">
          Was this handoff useful?
          {[true, false].map((v) => (
            <Button key={String(v)} size="sm" variant={useful === v ? "primary" : "secondary"} onClick={() => setUseful(v)}>{v ? "Yes" : "No"}</Button>
          ))}
        </div>
      </Dialog>
    </div>
  );
}
