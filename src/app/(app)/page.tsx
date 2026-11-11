"use client";
import Link from "next/link";
import { Badge, Card, ErrorBox, Loading, ModeBadge, Notice, PageHeader, SimBadge, Stat } from "@/components/ui";
import { ago, money, usd, useApi } from "@/lib/client";
import { Checklist } from "@/components/checklist";

const STATUS_TONE: Record<string, "ok" | "warn" | "danger" | "neutral"> = {
  CONNECTED: "ok",
  PENDING: "warn",
  TWO_FACTOR_REQUIRED: "warn",
  VERIFICATION_REQUIRED: "warn",
  REAUTH_REQUIRED: "danger",
  DISCONNECTED: "danger",
  ERROR: "danger",
  NOT_CONNECTED: "neutral",
};

export default function OverviewPage() {
  const { data, error, loading, reload } = useApi<any>("/api/overview", { poll: 10000 });
  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorBox error={error} retry={reload} />;
  const d = data!;
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Overview"
        description="Health, workload and automation state at a glance. Simulated data is always labelled and kept out of real sales figures."
        actions={
          <div className="flex items-center gap-2 text-xs text-muted">
            Global mode {d.automation.emergencyStop ? <Badge tone="danger">Emergency stop</Badge> : <ModeBadge mode={d.automation.globalMode} large />}
          </div>
        }
      />
      {!d.worker.running && (
        <Notice tone="warn">
          The background worker isn't running (last seen {ago(d.worker.lastSeen)}). Drafts, scheduled sends and notifications wait until it starts: <code>npm run worker</code> locally or the <code>worker</code> service in Docker.
        </Notice>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Link href="/inbox?filter=unread"><Stat label="Unread chats" value={d.counts.unread} /></Link>
        <Link href="/handoffs"><Stat label="Open handoffs" value={d.counts.handoffs} tone={d.counts.handoffs ? "warn" : undefined} /></Link>
        <Link href="/inbox?filter=drafts"><Stat label="Drafts to review" value={d.counts.proposed} hint={`${d.counts.queued} queued to auto-send`} /></Link>
        <Stat label="Uncertain sends" value={d.counts.uncertain} tone={d.counts.uncertain ? "danger" : undefined} hint="Need a human decision" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Connections" className="lg:col-span-2" actions={<Link className="text-xs text-accent hover:underline" href="/integrations">Manage</Link>}>
          <ul className="divide-y divide-line">
            {d.accounts.length === 0 && <li className="py-2 text-xs text-muted">No accounts. Open the simulator or connect a provider.</li>}
            {d.accounts.map((a: any) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{a.displayName}</span>
                  {a.isSimulated && <SimBadge />}
                  {a.modeOverride && <ModeBadge mode={a.modeOverride} />}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted">
                  <Badge tone={STATUS_TONE[a.connectionStatus]}>{a.connectionStatus.replace(/_/g, " ").toLowerCase()}</Badge>
                  {!a.isSimulated && <span>last sync {ago(a.lastSyncOkAt)}</span>}
                  {a.lastSyncError && <span className="text-danger" title={a.lastSyncError}>sync error</span>}
                </div>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="AI usage (estimated)" description="Token counts × configured price per model">
          <dl className="grid grid-cols-2 gap-y-2 text-[13px]">
            <dt className="text-muted">Today</dt>
            <dd className="text-right tabular-nums">{usd(d.ai.todayMicros)}</dd>
            <dt className="text-muted">Daily cap</dt>
            <dd className="text-right tabular-nums">{usd(d.automation.dailyBudgetMicros)}</dd>
            <dt className="text-muted">Calls today</dt>
            <dd className="text-right tabular-nums">{d.ai.calls}</dd>
            <dt className="text-muted">Last 7 days</dt>
            <dd className="text-right tabular-nums">{usd(d.ai.last7Micros)}</dd>
          </dl>
        </Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Verified sales (30 days)" description="Only transactions backed by a provider record. Manual entries are excluded.">
          {d.sales.verified30d.count === 0 ? (
            <p className="text-xs text-muted">No verified transactions yet. Revenue appears here only when a connected provider reports purchases; this build has no live transaction import.</p>
          ) : (
            <dl className="grid grid-cols-2 gap-y-2 text-[13px]">
              <dt className="text-muted">Purchases</dt>
              <dd className="text-right">{d.sales.verified30d.count}</dd>
              <dt className="text-muted">Gross</dt>
              <dd className="text-right">{money(d.sales.verified30d.grossCents)}</dd>
              <dt className="text-muted">Net of known fees/refunds</dt>
              <dd className="text-right">{money(d.sales.verified30d.netCents)}</dd>
            </dl>
          )}
          {d.sales.simulated30d.count > 0 && (
            <p className="mt-3 text-[11px] text-faint">
              Simulator: {d.sales.simulated30d.count} fictional purchases ({money(d.sales.simulated30d.grossCents)}), not counted above.
            </p>
          )}
        </Card>
        <div className="lg:col-span-2">
          <Checklist compact />
        </div>
      </div>
    </div>
  );
}
