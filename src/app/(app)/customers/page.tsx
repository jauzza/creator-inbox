"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { MessageSquare, Search, Users } from "lucide-react";
import { Avatar, Badge, cn, Empty, ErrorBox, InfoTip, Input, PageHeader, Segmented, Select, SimBadge, Skeleton, useAction } from "@/components/ui";
import { ago, money, post, useApi } from "@/lib/client";

type Sort = "intent" | "spend" | "recent" | "name";
const OUTCOME_LABEL: Record<string, string> = { NONE: "", CONTACTED: "Contacted", INTERESTED: "Interested", PURCHASED: "Purchased", DECLINED: "Not interested", NO_RESPONSE: "No response" };
const SIGNAL_TEXT: Record<string, string> = { price_question: "asked about a price", catalog_question: "asked about content", purchase_interest: "said they'd like to buy", prior_purchase: "bought before", recent_engagement: "chatting actively", decline: "said no thanks" };

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
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Customers" description="Everyone you talk to, with the ones showing the most interest at the top. Every ranking is explained by what the customer actually said." />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-60">
          <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-faint" aria-hidden />
          <Input aria-label="Search customers" placeholder="Search by name" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
        <Segmented
          label="Sort by"
          size="sm"
          value={sort}
          onChange={setSort}
          options={[
            { value: "intent", label: "Most interested" },
            { value: "spend", label: "Top spenders" },
            { value: "recent", label: "Recent" },
            { value: "name", label: "A–Z" },
          ]}
        />
        <div className="ml-auto flex gap-2">
          {allTags.length > 0 && <Select aria-label="Tag" value={tag} onChange={(e) => setTag(e.target.value)} className="h-8 w-36 text-xs" options={[{ value: "", label: "All tags" }, ...allTags.map((t) => ({ value: t, label: t }))]} />}
          <Select aria-label="Status" value={outcome} onChange={(e) => setOutcome(e.target.value)} className="h-8 w-40 text-xs" options={[{ value: "", label: "Any status" }, ...Object.entries(OUTCOME_LABEL).filter(([k]) => k !== "NONE").map(([value, label]) => ({ value, label }))]} />
        </div>
      </div>
      {loading && !data && (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[76px] rounded-xl" />)}
        </div>
      )}
      {error && <ErrorBox error={error} retry={reload} />}
      {data && rows.length === 0 && (
        <Empty icon={<Users className="size-5" />} title={q || tag || outcome ? "No customers match" : "No customers yet"}>
          {q || tag || outcome ? "Try clearing the search or filters." : "Customers appear here as soon as they message you."}
        </Empty>
      )}
      {data && rows.length > 0 && (
        <>
          <div className="hidden grid-cols-[minmax(0,1fr)_150px_110px_150px_36px] gap-4 px-4 pb-2 text-xs text-faint md:grid">
            <span>Customer</span>
            <span className="flex items-center gap-1">
              Interest
              <InfoTip>Based on what each customer said recently (like asking about prices). It fades over time. It's a ranking, not a prediction.</InfoTip>
            </span>
            <span>Spent</span>
            <span>Assigned to</span>
            <span />
          </div>
          <ul className="space-y-1.5">
            {rows.map((c: any) => (
              <li key={c.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 rounded-xl border border-line bg-panel px-4 py-3 transition-colors hover:border-line-strong md:grid-cols-[minmax(0,1fr)_150px_110px_150px_36px]">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={c.name} size={38} />
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-[14px] font-medium">
                      <span className="truncate">{c.name}</span>
                      {c.isSimulated && <SimBadge />}
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                      {OUTCOME_LABEL[c.outcome] && <span>{OUTCOME_LABEL[c.outcome]}</span>}
                      {c.evidence[0] && <span className="truncate text-faint">· {evidenceText(c.evidence[0])}</span>}
                      {c.doNotContact && <Badge tone="danger">Do not contact</Badge>}
                      {c.suppressedUntil && new Date(c.suppressedUntil) > new Date() && <Badge tone="neutral">Offers paused</Badge>}
                      {c.tags.map((t: string) => <Badge key={t}>{t}</Badge>)}
                    </div>
                  </div>
                </div>
                <div className="hidden md:block">
                  <InterestBar value={c.intent} />
                  <p className="mt-1 text-[11px] text-faint">{c.intentUpdatedAt ? `updated ${ago(c.intentUpdatedAt)}` : "no signals yet"}</p>
                </div>
                <div className="hidden text-[13px] tabular-nums md:block">
                  {money(c.verifiedSpendCents)}
                  {c.unverifiedSpendCents > 0 && <p className="text-[11px] text-warn">+{money(c.unverifiedSpendCents)} unverified</p>}
                </div>
                <div className="hidden md:block">
                  <Select
                    aria-label={`Assign ${c.name}`}
                    className="h-8 text-xs"
                    value={c.assignedUserId ?? ""}
                    onChange={(e) => run("assign", () => post(`/api/customers/${c.id}`, { assignedUserId: e.target.value || null }).then(reload), "Assigned")}
                    options={[{ value: "", label: "Nobody" }, ...data.users.map((u: any) => ({ value: u.id, label: u.name }))]}
                  />
                </div>
                {c.conversationId ? (
                  <Link href={`/inbox?c=${c.conversationId}`} aria-label={`Open chat with ${c.name}`} title="Open chat" className="flex size-9 items-center justify-center rounded-lg text-muted hover:bg-panel-3 hover:text-fg">
                    <MessageSquare className="size-4" />
                  </Link>
                ) : (
                  <span />
                )}
                <div className="col-span-2 flex items-center gap-4 md:hidden">
                  <div className="flex-1"><InterestBar value={c.intent} /></div>
                  <span className="text-[13px] tabular-nums text-muted">{money(c.verifiedSpendCents)}</span>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-faint">Spending only counts purchases confirmed by a transaction record. Demo customers are labelled and never mixed into your real totals.</p>
        </>
      )}
    </div>
  );
}

function evidenceText(e: string) {
  const m = e.match(/^(\w+) \(\+?(-?\d+)\): “(.*)”$/);
  if (!m) return e;
  return `${SIGNAL_TEXT[m[1]] ?? m[1].replace(/_/g, " ")}`;
}

function InterestBar({ value }: { value: number }) {
  const tone = value >= 70 ? "bg-ok" : value >= 40 ? "bg-accent" : value >= 15 ? "bg-info/70" : "bg-line-strong";
  return (
    <div className="flex items-center gap-2" aria-label={`Interest ${value} out of 100`}>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-panel-3">
        <div className={cn("h-full rounded-full transition-all duration-500", tone)} style={{ width: `${Math.max(3, value)}%` }} />
      </div>
      <span className="w-7 text-right text-xs tabular-nums text-muted">{value}</span>
    </div>
  );
}
