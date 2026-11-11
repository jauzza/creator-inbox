"use client";
import Link from "next/link";
import { useState } from "react";
import { Card, ErrorBox, Loading, Notice, PageHeader, Select, Stat, Switch, Table } from "@/components/ui";
import { money, usd, useApi } from "@/lib/client";

const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);
const dur = (s: number | null) => (s == null ? "—" : s < 120 ? `${Math.round(s)}s` : s < 7200 ? `${Math.round(s / 60)}m` : `${(s / 3600).toFixed(1)}h`);

function Source({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 text-[11px] text-faint">Source: {children}</p>;
}

export default function AnalyticsPage() {
  const [days, setDays] = useState("30");
  const [sim, setSim] = useState(false);
  const { data: d, error, loading, reload } = useApi<any>(`/api/analytics?days=${days}&sim=${sim ? 1 : 0}`);
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        eyebrow={<Link href="/" className="hover:underline">← Home</Link>}
        title="Reports"
        description="How your inbox is doing. Every number says where it comes from, sales only count when a transaction record backs them up, and demo data stays out unless you switch it on."
        actions={
          <div className="flex items-center gap-3">
            <Select aria-label="Window" className="h-8 w-32" value={days} onChange={(e) => setDays(e.target.value)} options={[{ value: "7", label: "7 days" }, { value: "30", label: "30 days" }, { value: "90", label: "90 days" }]} />
            <label className="flex items-center gap-2 text-xs text-muted">Include demo data <Switch label="Include simulator data" checked={sim} onChange={setSim} /></label>
          </div>
        }
      />
      {loading && !d && <Loading />}
      {error && <ErrorBox error={error} retry={reload} />}
      {d && (
        <>
          {sim && <Notice tone="warn">Simulator data is included. These numbers describe fictional activity.</Notice>}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Median response" value={dur(d.responseTime.medianSecAll)} hint={`AI ${dur(d.responseTime.medianSecAi)} · human ${dur(d.responseTime.medianSecHuman)} · n=${d.responseTime.samples}`} />
            <Stat label="Draft approval rate" value={pct(d.drafts.approvalRate)} hint={`${d.drafts.approvedUnchanged + d.drafts.approvedEdited} approved / ${d.drafts.rejected} rejected`} />
            <Stat label="Edit rate" value={pct(d.drafts.editRate)} hint="Share of approved drafts edited first" />
            <Stat label="Verified purchases" value={d.revenue.verifiedCount} hint={money(d.revenue.grossCents) + " gross"} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Which replies did the creator prefer?">
              <dl className="grid grid-cols-2 gap-y-1 text-[13px]">
                <dt className="text-muted">Drafted</dt><dd className="text-right">{d.drafts.drafted}</dd>
                <dt className="text-muted">Approved unchanged</dt><dd className="text-right">{d.drafts.approvedUnchanged}</dd>
                <dt className="text-muted">Approved after edit</dt><dd className="text-right">{d.drafts.approvedEdited}</dd>
                <dt className="text-muted">Rejected</dt><dd className="text-right">{d.drafts.rejected}</dd>
                <dt className="text-muted">Sent</dt><dd className="text-right">{d.drafts.sent}</dd>
              </dl>
              <p className="mt-3 text-xs font-medium">What caused edits (reviewer labels)</p>
              {Object.keys(d.drafts.labels).length === 0 ? <p className="text-xs text-muted">No labels yet. Label drafts in the inbox to learn which facts or tone choices cause edits.</p> : (
                <ul className="mt-1 space-y-0.5 text-xs">{Object.entries(d.drafts.labels).sort((a: any, b: any) => b[1] - a[1]).map(([k, v]: any) => <li key={k} className="flex justify-between"><span>{k.replace(/_/g, " ")}</span><span>{v}</span></li>)}</ul>
              )}
              <Source>{d.drafts.source}</Source>
            </Card>
            <Card title="Which handoffs were useful?">
              {d.handoffs.byCategory.length === 0 ? <p className="text-xs text-muted">No handoffs in this window.</p> : (
                <ul className="space-y-0.5 text-xs">{d.handoffs.byCategory.map((h: any, i: number) => <li key={i} className="flex justify-between"><span>{h.category.replace(/_/g, " ")} · {h.status.toLowerCase()}</span><span>{h.count}</span></li>)}</ul>
              )}
              <p className="mt-2 text-xs">Marked useful: {d.handoffs.useful.true ?? 0} · not useful: {d.handoffs.useful.false ?? 0} · unrated: {d.handoffs.useful.null ?? 0} · takeovers: {d.handoffs.takeovers}</p>
              <Source>{d.handoffs.source}</Source>
            </Card>
            <Card title="What verified outcomes followed?">
              <dl className="grid grid-cols-2 gap-y-1 text-[13px]">
                <dt className="text-muted">Gross (verified)</dt><dd className="text-right">{money(d.revenue.grossCents)}</dd>
                <dt className="text-muted">Refunds</dt><dd className="text-right">{money(d.revenue.refundsCents)}</dd>
                <dt className="text-muted">Known fees</dt><dd className="text-right">{money(d.revenue.knownFeesCents)}{d.revenue.feesUnknownCount ? ` (+${d.revenue.feesUnknownCount} unknown)` : ""}</dd>
                <dt className="text-muted">AI cost (est.)</dt><dd className="text-right">{usd(d.revenue.aiCostMicros)}</dd>
                <dt className="font-medium">Net after known costs</dt><dd className="text-right font-medium">{money(d.revenue.netAfterKnownFeesRefundsAndAiCents)}</dd>
                <dt className="text-muted">Attributed to an offer</dt><dd className="text-right">{d.revenue.attributed}</dd>
                <dt className="text-muted">Unknown attribution</dt><dd className="text-right">{d.revenue.unknownAttribution}</dd>
                <dt className="text-muted">Offers sent / declines</dt><dd className="text-right">{d.revenue.offersSent} / {d.revenue.declines}</dd>
                <dt className="text-muted">Unverified (manual)</dt><dd className="text-right">{d.revenue.unverifiedCount} · {money(d.revenue.unverifiedCents)}</dd>
              </dl>
              <Notice tone="warn">{d.revenue.caveat}</Notice>
              <Source>{d.revenue.source} Opens/unlocks are not shown: not supported by the selected provider integration.</Source>
            </Card>
            <Card title="Is there enough evidence to change the default?">
              {d.experiment.rows.length === 0 ? <p className="text-xs text-muted">No experiment data. Configure one under Creator style → Experiment.</p> : (
                <Table head={["Variant", "Draft status", "Count"]}>{d.experiment.rows.map((r: any, i: number) => <tr key={i}><td className="px-3 py-1.5 text-xs">{r.variant}</td><td className="px-3 py-1.5 text-xs">{r.status.toLowerCase()}</td><td className="px-3 py-1.5 text-xs">{r.count}</td></tr>)}</Table>
              )}
              <p className="mt-2 text-xs text-muted">Compare per-customer outcomes over a fixed window, report sample size and uncertainty, and keep pricing/catalog/operator coverage comparable. Before/after comparisons are not causal. With fewer than ~30 verified purchases per variant, the honest answer is “not enough data”.</p>
              <Source>{d.experiment.source}</Source>
            </Card>
          </div>
          <Card title="Model usage">
            {d.modelUsage.rows.length === 0 ? <p className="text-xs text-muted">No AI calls in this window.</p> : (
              <Table head={["Model", "Purpose", "Calls", "Tokens in / out", "Est. cost", "Avg latency"]}>
                {d.modelUsage.rows.map((r: any, i: number) => (
                  <tr key={i}><td className="px-3 py-1.5 text-xs">{r.model}</td><td className="px-3 py-1.5 text-xs">{r.purpose}</td><td className="px-3 py-1.5 text-xs">{r.calls}</td><td className="px-3 py-1.5 text-xs">{r.tokensIn} / {r.tokensOut}</td><td className="px-3 py-1.5 text-xs">{usd(r.costMicros)}</td><td className="px-3 py-1.5 text-xs">{r.avgLatencyMs} ms</td></tr>
                ))}
              </Table>
            )}
            <Source>{d.modelUsage.source}</Source>
          </Card>
        </>
      )}
    </div>
  );
}
