"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Search } from "lucide-react";
import { Badge, Button, cn, Empty, ErrorBox, Input, Loading, ModeBadge, SimBadge } from "@/components/ui";
import { ago, useApi } from "@/lib/client";
import { ConversationView } from "@/components/inbox/conversation";
import { CustomerPanel } from "@/components/inbox/customer";

const FILTERS = [
  { id: "", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "drafts", label: "Drafts" },
  { id: "handoff", label: "Handoffs" },
  { id: "mine", label: "Mine" },
];

export default function InboxPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Inbox />
    </Suspense>
  );
}

function Inbox() {
  const sp = useSearchParams();
  const router = useRouter();
  const selected = sp.get("c");
  const [filter, setFilter] = useState(sp.get("filter") ?? "");
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [pane, setPane] = useState<"chat" | "details">("chat");
  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q), 250);
    return () => clearTimeout(t);
  }, [q]);
  const listUrl = useMemo(() => `/api/conversations?filter=${filter}&q=${encodeURIComponent(qDebounced)}`, [filter, qDebounced]);
  const list = useApi<any[]>(listUrl, { poll: 5000 });
  const detail = useApi<any>(selected ? `/api/conversations/${selected}` : null, { poll: 4000 });

  const open = (id: string | null) => {
    const p = new URLSearchParams(sp.toString());
    if (id) p.set("c", id);
    else p.delete("c");
    setPane("chat");
    router.push(`/inbox?${p.toString()}`, { scroll: false });
  };

  return (
    <div className="-m-3 flex h-[calc(100dvh-3.5rem)] sm:-m-5">
      {/* Column 1: conversation list (hidden on small screens while a chat is open) */}
      <section aria-label="Conversations" className={cn("flex w-full flex-col border-r border-line md:w-80 md:shrink-0", selected && "hidden md:flex")}>
        <div className="space-y-2 border-b border-line p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-faint" aria-hidden />
            <Input aria-label="Search customers" placeholder="Search customers" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" />
          </div>
          <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Filter">
            {FILTERS.map((f) => (
              <button key={f.id} role="tab" aria-selected={filter === f.id} onClick={() => setFilter(f.id)} className={cn("rounded px-2 py-1 text-xs", filter === f.id ? "bg-panel-2 text-fg" : "text-muted hover:text-fg")}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {list.loading && !list.data && <Loading />}
          {list.error && <div className="p-3"><ErrorBox error={list.error} retry={list.reload} /></div>}
          {list.data?.length === 0 && (
            <div className="p-3">
              <Empty title="No conversations here">Use the Simulator to create test conversations, or connect a provider under Integrations.</Empty>
            </div>
          )}
          <ul>
            {list.data?.map((c) => (
              <li key={c.id}>
                <button onClick={() => open(c.id)} aria-current={selected === c.id} className={cn("w-full border-b border-line px-3 py-2.5 text-left hover:bg-panel", selected === c.id && "bg-panel-2")}>
                  <div className="flex items-center gap-2">
                    <span className={cn("truncate text-[13px]", c.unread ? "font-semibold text-fg" : "text-fg/90")}>{c.customer.name}</span>
                    {c.account.isSimulated && <SimBadge />}
                    <span className="ml-auto shrink-0 text-[11px] text-faint">{ago(c.lastMessage?.at)}</span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted">
                    {c.lastMessage?.direction === "OUTBOUND" && <span className="text-faint">You: </span>}
                    {c.lastMessage?.body ?? "No messages"}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    <ModeBadge mode={c.mode} />
                    {c.unread > 0 && <Badge tone="info">{c.unread} new</Badge>}
                    {c.draft && <Badge tone={c.draft.status === "UNCERTAIN" ? "danger" : c.draft.status === "QUEUED" ? "ok" : "neutral"}>{c.draft.status === "QUEUED" ? `sends ${ago(c.draft.scheduledFor)}` : c.draft.status.toLowerCase()}</Badge>}
                    {c.handoff && <Badge tone="warn">handoff</Badge>}
                    {c.customer.intent >= 40 && <Badge tone="accent" title="Intent heuristic (0–100), not a probability">intent {c.customer.intent}</Badge>}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Column 2: conversation */}
      <section aria-label="Conversation" className={cn("min-w-0 flex-1 flex-col", selected ? (pane === "chat" ? "flex" : "hidden xl:flex") : "hidden md:flex")}>
        {!selected && <div className="m-auto p-6"><Empty title="Select a conversation">Pick a chat on the left. Drafts, controls and the customer's details open here.</Empty></div>}
        {selected && detail.loading && !detail.data && <Loading />}
        {selected && detail.error && !detail.data && <div className="p-4"><ErrorBox error={detail.error} retry={detail.reload} /></div>}
        {selected && detail.data && (
          <ConversationView
            key={selected}
            c={detail.data}
            reload={() => {
              detail.reload();
              list.reload();
            }}
            onBack={() => open(null)}
            onDetails={() => setPane("details")}
          />
        )}
      </section>

      {/* Column 3: customer details (own pane on mobile/tablet) */}
      {selected && detail.data && (
        <aside aria-label="Customer details" className={cn("w-full flex-col overflow-y-auto border-l border-line xl:flex xl:w-80 xl:shrink-0", pane === "details" ? "flex" : "hidden")}>
          <div className="flex items-center gap-2 border-b border-line p-2 xl:hidden">
            <Button size="sm" variant="ghost" onClick={() => setPane("chat")}>
              <ArrowLeft className="size-4" /> Back to chat
            </Button>
          </div>
          <CustomerPanel c={detail.data} reload={detail.reload} />
        </aside>
      )}
    </div>
  );
}
