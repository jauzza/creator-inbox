"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowDownUp } from "lucide-react";
import { Badge, Empty, ErrorBox, Input, Loading, PageHeader, Select, SimBadge, Table, useAction } from "@/components/ui";
import { ago, money, post, useApi } from "@/lib/client";

type Sort = "intent" | "spend" | "recent" | "name";

export default function CustomersPage() {
  const [q, setQ] = useState("");
  const [tag, setTag] = useState("");
  const [outcome, setOutcome] = useState("");
  const [sort, setSort] = useState<Sort>("intent");
  const { data, error, loading, reload } = useApi<any>(`/api/customers?q=${encodeURIComponent(q)}&tag=${encodeURIComponent(tag)}`, { poll: 15000 });
  const { run } = useAction();
  const rows = useMemo(() => {
    const r = [...(data?.customers ?? [])].filter((c: any) => !outcome || c.outcome === outcome);
    const by: Record<Sort, (a: any, b: any) => number> = {
      intent: (a, b) => b.intent - a.intent,
      spend: (a, b) => b.verifiedSpendCents - a.verifiedSpendCents,
      recent: (a, b) => new Date(b.intentUpdatedAt ?? 0).getTime() - new Date(a.intentUpdatedAt ?? 0).getTime(),
      name: (a, b) => a.name.localeCompare(b.name),
    };
    return r.sort(by[sort]);
  }, [data, outcome, sort]);
  const allTags = useMemo(() => [...new Set((data?.customers ?? []).flatMap((c: any) => c.tags))] as string[], [data]);

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Customers"
        description="Intent is a decaying ranking heuristic built from message evidence, not a purchase probability. Engagement and verified spending are kept separate. No wealth or vulnerability inference."
      />
      <div className="mb-3 flex flex-wrap gap-2">
        <Input aria-label="Search" placeholder="Search name" value={q} onChange={(e) => setQ(e.target.value)} className="w-48" />
        <Select aria-label="Tag" value={tag} onChange={(e) => setTag(e.target.value)} className="w-40" options={[{ value: "", label: "All tags" }, ...allTags.map((t) => ({ value: t, label: t }))]} />
        <Select aria-label="Outcome" value={outcome} onChange={(e) => setOutcome(e.target.value)} className="w-44" options={[{ value: "", label: "All outcomes" }, ...["NONE", "CONTACTED", "INTERESTED", "PURCHASED", "DECLINED", "NO_RESPONSE"].map((o) => ({ value: o, label: o.toLowerCase().replace("_", " ") }))]} />
        <label className="flex items-center gap-1 text-xs text-muted">
          <ArrowDownUp className="size-3.5" aria-hidden />
          <Select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="w-40" options={[{ value: "intent", label: "Intent" }, { value: "spend", label: "Verified spend" }, { value: "recent", label: "Recent signal" }, { value: "name", label: "Name" }]} />
        </label>
      </div>
      {loading && !data && <Loading />}
      {error && <ErrorBox error={error} retry={reload} />}
      {data && rows.length === 0 && <Empty title="No customers match">Simulated customers appear after seeding; real ones after connecting a provider.</Empty>}
      {data && rows.length > 0 && (
        <Table head={["Customer", "Intent", "Evidence", "Engagement", "Purchases", "Outcome", "Assigned", ""]}>
          {rows.map((c: any) => (
            <tr key={c.id} className="align-top">
              <td className="px-3 py-2">
                <div className="flex items-center gap-1.5 font-medium">
                  {c.name} {c.isSimulated && <SimBadge />}
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {c.tags.map((t: string) => <Badge key={t}>{t}</Badge>)}
                  {c.doNotContact && <Badge tone="danger">do not contact</Badge>}
                  {c.suppressedUntil && new Date(c.suppressedUntil) > new Date() && <Badge tone="warn">offers suppressed</Badge>}
                </div>
              </td>
              <td className="px-3 py-2 tabular-nums">
                <span className="text-base font-semibold">{c.intent}</span>
                <p className="text-[11px] text-faint">{ago(c.intentUpdatedAt)}</p>
              </td>
              <td className="max-w-xs px-3 py-2 text-xs text-muted">{c.evidence.length ? c.evidence.map((e: string, i: number) => <p key={i}>{e}</p>) : <span className="text-faint">no signals</span>}</td>
              <td className="px-3 py-2 tabular-nums">{c.engagement}</td>
              <td className="px-3 py-2 text-xs">
                {money(c.verifiedSpendCents)} verified
                {c.unverifiedSpendCents > 0 && <p className="text-warn">{money(c.unverifiedSpendCents)} unverified</p>}
                <p className="text-faint">{c.purchaseCount} record(s)</p>
              </td>
              <td className="px-3 py-2 text-xs">{c.outcome.toLowerCase().replace("_", " ")}</td>
              <td className="px-3 py-2">
                <Select
                  aria-label={`Assign ${c.name}`}
                  className="h-7 w-32 py-0 text-xs"
                  value={c.assignedUserId ?? ""}
                  onChange={(e) => run("assign", () => post(`/api/customers/${c.id}`, { assignedUserId: e.target.value || null }).then(reload), "Assigned")}
                  options={[{ value: "", label: "Unassigned" }, ...data.users.map((u: any) => ({ value: u.id, label: u.name }))]}
                />
              </td>
              <td className="px-3 py-2">{c.conversationId && <Link className="text-xs text-accent hover:underline" href={`/inbox?c=${c.conversationId}`}>Open chat</Link>}</td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
