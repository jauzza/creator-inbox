"use client";
import { useEffect, useState } from "react";
import { Badge, Button, Card, ErrorBox, Field, Input, Loading, Notice, PageHeader, Select, Switch, Table, Tabs, Textarea, useAction } from "@/components/ui";
import { ago, fmtTime, money, post, useApi } from "@/lib/client";

export default function ActivityPage() {
  const [tab, setTab] = useState<"audit" | "team" | "catalog" | "retention" | "trouble">("audit");
  useEffect(() => localStorage.setItem("ci_logs_seen", "1"), []);
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader title="Activity & settings" description="Audit history of every control action, team permissions, the human-controlled catalog, retention, backups and troubleshooting." />
      <Tabs tabs={[{ id: "audit", label: "Audit log" }, { id: "team", label: "Team" }, { id: "catalog", label: "Catalog" }, { id: "retention", label: "Retention & backups" }, { id: "trouble", label: "Troubleshooting" }]} value={tab} onChange={setTab} />
      {tab === "audit" && <Audit />}
      {tab === "team" && <Team />}
      {tab === "catalog" && <Catalog />}
      {tab === "retention" && <Retention />}
      {tab === "trouble" && <Trouble />}
    </div>
  );
}

function Audit() {
  const [q, setQ] = useState("");
  const { data, error, reload } = useApi<any>(`/api/activity?q=${encodeURIComponent(q)}`, { poll: 10000 });
  return (
    <Card title="Audit history" description="Secrets and tokens are redacted before anything is written." actions={<Input aria-label="Filter actions" placeholder="filter, e.g. draft." value={q} onChange={(e) => setQ(e.target.value)} className="h-8 w-48" />}>
      {error && <ErrorBox error={error} retry={reload} />}
      {!data ? <Loading /> : (
        <Table head={["When", "Who", "Action", "Target", "Details"]}>
          {data.logs.map((l: any) => (
            <tr key={l.id}>
              <td className="whitespace-nowrap px-3 py-1.5 text-xs text-muted">{fmtTime(l.at)}</td>
              <td className="px-3 py-1.5 text-xs">{l.actor}</td>
              <td className="px-3 py-1.5 font-mono text-xs">{l.action}</td>
              <td className="max-w-[10rem] truncate px-3 py-1.5 font-mono text-[11px] text-faint">{l.target}</td>
              <td className="max-w-xs truncate px-3 py-1.5 text-[11px] text-muted" title={JSON.stringify(l.details)}>{Object.keys(l.details ?? {}).length ? JSON.stringify(l.details) : ""}</td>
            </tr>
          ))}
        </Table>
      )}
    </Card>
  );
}

function Team() {
  const { data, reload } = useApi<any>("/api/team");
  const { busy, run } = useAction();
  const [f, setF] = useState({ email: "", name: "", role: "OPERATOR", password: "" });
  if (!data) return <Loading />;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Users" description="Owners see every account and manage settings. Operators only see accounts granted below.">
        <ul className="divide-y divide-line">
          {data.users.map((u: any) => (
            <li key={u.id} className="space-y-1 py-2">
              <div className="flex items-center gap-2 text-[13px]">
                <span className="font-medium">{u.name}</span> <span className="text-muted">{u.email}</span> <Badge tone={u.role === "OWNER" ? "accent" : "neutral"}>{u.role.toLowerCase()}</Badge> {u.disabled && <Badge tone="danger">disabled</Badge>}
                <span className="ml-auto flex items-center gap-1 text-xs text-muted">active <Switch label={`Enable ${u.name}`} checked={!u.disabled} onChange={(v) => run("d", () => post("/api/team", { action: "disable", userId: u.id, disabled: !v }).then(reload), "Updated")} /></span>
              </div>
              {u.role === "OPERATOR" && (
                <div className="flex flex-wrap gap-1">
                  {data.accounts.map((a: any) => {
                    const has = u.accounts.includes(a.id);
                    return <button key={a.id} aria-pressed={has} onClick={() => run("a", () => post("/api/team", { action: "access", userId: u.id, accountIds: has ? u.accounts.filter((x: string) => x !== a.id) : [...u.accounts, a.id] }).then(reload), "Access updated")} className={`rounded border px-2 py-0.5 text-xs ${has ? "border-accent text-accent" : "border-line-strong text-muted"}`}>{a.displayName}</button>;
                  })}
                </div>
              )}
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Add a team member" description="Share the password through a password manager, never in chat.">
        <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); run("c", () => post("/api/team", { action: "create", ...f }).then(() => { setF({ email: "", name: "", role: "OPERATOR", password: "" }); reload(); }), "User created"); }}>
          <Field label="Name">{(id) => <Input id={id} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />}</Field>
          <Field label="Email">{(id) => <Input id={id} type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />}</Field>
          <Field label="Role">{(id) => <Select id={id} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} options={[{ value: "OPERATOR", label: "Operator" }, { value: "OWNER", label: "Owner" }]} />}</Field>
          <Field label="Initial password (12+ chars)">{(id) => <Input id={id} type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />}</Field>
          <Button type="submit" variant="primary" loading={busy === "c"}>Create</Button>
        </form>
      </Card>
    </div>
  );
}

function Catalog() {
  const { data, reload } = useApi<any>("/api/catalog");
  const accounts = useApi<any>("/api/automation");
  const { run } = useAction();
  const blank = { accountId: "", externalAssetId: "", title: "", description: "", price: "", priceConfirmed: false, active: true };
  const [f, setF] = useState<any>(blank);
  const [editing, setEditing] = useState<string | null>(null);
  if (!data) return <Loading />;
  const save = () =>
    run("s", () => post("/api/catalog", { action: "upsert", id: editing ?? undefined, item: { accountId: f.accountId, externalAssetId: f.externalAssetId, title: f.title, description: f.description, priceCents: f.price === "" ? null : Math.round(Number(f.price) * 100), priceConfirmed: f.priceConfirmed, active: f.active } }).then(() => { setF(blank); setEditing(null); reload(); }), "Catalog saved");
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card title="Catalog (human-controlled)" description="The AI may only mention these items, and only state a price when it's marked confirmed. Never invented assets, discounts or scarcity." className="lg:col-span-2">
        <Table head={["Item", "Asset id", "Price", "Status", ""]}>
          {data.items.map((i: any) => (
            <tr key={i.id}>
              <td className="px-3 py-2"><p className="font-medium">{i.title}</p><p className="text-xs text-muted">{i.description}</p><p className="text-[11px] text-faint">{i.account.displayName}</p></td>
              <td className="px-3 py-2 font-mono text-xs">{i.externalAssetId}</td>
              <td className="px-3 py-2 text-xs">{money(i.priceCents)} {i.priceConfirmed ? <Badge tone="ok">confirmed</Badge> : <Badge tone="warn">unconfirmed</Badge>}</td>
              <td className="px-3 py-2 text-xs">{i.active ? "active" : "inactive"}</td>
              <td className="px-3 py-2"><Button size="sm" variant="ghost" onClick={() => { setEditing(i.id); setF({ accountId: i.accountId, externalAssetId: i.externalAssetId, title: i.title, description: i.description, price: i.priceCents == null ? "" : (i.priceCents / 100).toFixed(2), priceConfirmed: i.priceConfirmed, active: i.active }); }}>Edit</Button></td>
            </tr>
          ))}
        </Table>
      </Card>
      <Card title={editing ? "Edit item" : "Add item"} description="Owner only. Use the asset id from the platform for existing content.">
        <div className="space-y-2">
          <Field label="Account">{(id) => <Select id={id} value={f.accountId} onChange={(e) => setF({ ...f, accountId: e.target.value })} options={[{ value: "", label: "Choose…" }, ...(accounts.data?.accounts ?? []).map((a: any) => ({ value: a.id, label: a.displayName }))]} />}</Field>
          <Field label="Asset id">{(id) => <Input id={id} value={f.externalAssetId} onChange={(e) => setF({ ...f, externalAssetId: e.target.value })} />}</Field>
          <Field label="Title">{(id) => <Input id={id} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />}</Field>
          <Field label="Non-explicit description">{(id) => <Textarea id={id} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />}</Field>
          <Field label="Price (USD, blank = unknown)">{(id) => <Input id={id} inputMode="decimal" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} />}</Field>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={f.priceConfirmed} onChange={(e) => setF({ ...f, priceConfirmed: e.target.checked })} /> Price confirmed (AI may state it)</label>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Active</label>
          <div className="flex gap-2"><Button variant="primary" onClick={save} disabled={!f.accountId || !f.title || !f.externalAssetId}>Save</Button>{editing && <Button variant="ghost" onClick={() => { setEditing(null); setF(blank); }}>Cancel</Button>}</div>
        </div>
      </Card>
    </div>
  );
}

function Retention() {
  const { busy, run } = useAction();
  const [kind, setKind] = useState("messages");
  const [days, setDays] = useState("365");
  const [confirmText, setConfirmText] = useState("");
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Retention purge" description="Permanently deletes old rows. Back up first. Type DELETE to confirm.">
        <div className="space-y-2">
          <Field label="What">{(id) => <Select id={id} value={kind} onChange={(e) => setKind(e.target.value)} options={[{ value: "messages", label: "Message bodies" }, { value: "audit", label: "Audit log" }, { value: "jobs", label: "Finished jobs" }, { value: "ai_usage", label: "AI usage rows" }]} />}</Field>
          <Field label="Older than (days, min 7)">{(id) => <Input id={id} type="number" value={days} onChange={(e) => setDays(e.target.value)} />}</Field>
          <Field label="Type DELETE">{(id) => <Input id={id} value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />}</Field>
          <Button variant="danger" loading={busy === "p"} disabled={confirmText !== "DELETE"} onClick={() => run("p", () => post("/api/retention", { kind, olderThanDays: Number(days), confirm: "DELETE" }).then((r) => { setConfirmText(""); return r; }), (r: any) => `Deleted ${r.deleted} rows`)}>Purge</Button>
        </div>
      </Card>
      <Card title="Backups">
        <div className="space-y-2 text-xs text-muted">
          <p>Back up Postgres and keep <b>MASTER_KEY</b> separately (password manager). A database backup without the key cannot decrypt stored provider/AI/Telegram keys, and the key without the backup is useless. That's intentional.</p>
          <pre className="overflow-x-auto rounded bg-bg p-2 text-[11px]">{`# Docker
docker compose exec -T db pg_dump -U inbox -Fc creator_inbox > backups/inbox-$(date +%F).dump
# Restore into an empty database
docker compose exec -T db pg_restore -U inbox -d creator_inbox --clean < backups/inbox-YYYY-MM-DD.dump
# Local (no Docker)
npm run backup`}</pre>
          <p>See README → Backup &amp; restore for scheduling (cron) and off-site copies. Test a restore before relying on it.</p>
        </div>
      </Card>
    </div>
  );
}

function Trouble() {
  const { data } = useApi<any>("/api/activity");
  const health = useApi<any>("/api/health", { poll: 10000 });
  if (!data) return <Loading />;
  const t = data.troubleshooting;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Health">
        <ul className="space-y-1 text-[13px]">
          <li>Database: {health.data?.db === "ok" ? <Badge tone="ok">ok</Badge> : <Badge tone="danger">unreachable</Badge>}</li>
          <li>Worker: {health.data?.worker === "ok" ? <Badge tone="ok">running</Badge> : <Badge tone="danger">not running</Badge>} <span className="text-xs text-muted">last seen {ago(t.workerLastSeen)}</span></li>
          {t.accounts.map((a: any, i: number) => <li key={i}>{a.displayName}: <Badge>{a.connectionStatus.toLowerCase()}</Badge> {a.lastSyncError && <span className="text-xs text-danger">{a.lastSyncError}</span>}</li>)}
        </ul>
      </Card>
      <Card title="Common fixes">
        <ul className="list-disc space-y-1 pl-4 text-xs text-muted">
          <li>Drafts never appear → the worker isn't running (<code>npm run worker</code> / docker <code>worker</code> service) or the chat's mode is Manual/Paused.</li>
          <li>“Model has not passed a connection test” → Integrations → AI → Test model.</li>
          <li>Webhooks not arriving → they can't reach localhost; use polling, or the VPS with HTTPS and a signing secret.</li>
          <li>Account shows “reauth required / 2FA” → reconnect in the provider's dashboard, then Sync now.</li>
          <li>Uncertain sends → open the chat; confirm on the platform, then mark delivered, retry with the same key, or discard.</li>
        </ul>
      </Card>
      <Card title="Recent failed jobs">
        {t.failedJobs.length === 0 ? <Notice tone="ok">No failed jobs.</Notice> : <ul className="space-y-1 text-xs">{t.failedJobs.map((j: any) => <li key={j.id}><span className="font-mono">{j.type}</span> · {ago(j.at)} · <span className="text-danger">{j.error}</span></li>)}</ul>}
      </Card>
      <Card title="Webhook processing errors">
        {t.webhookErrors.length === 0 ? <Notice tone="ok">None.</Notice> : <ul className="space-y-1 text-xs">{t.webhookErrors.map((w: any) => <li key={w.id}>{w.type} · {ago(w.at)} · <span className="text-danger">{w.error}</span></li>)}</ul>}
      </Card>
    </div>
  );
}
