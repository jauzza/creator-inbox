"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Inbox as InboxIcon, Search, X } from "lucide-react";
import { Avatar, cn, Empty, ErrorBox, Input, Loading, SimBadge, Skeleton } from "@/components/ui";
import { ago, useApi } from "@/lib/client";
import { ConversationView } from "@/components/inbox/conversation";
import { CustomerPanel } from "@/components/inbox/customer";
import { useTour } from "@/components/tour/tour";
import { useShell } from "@/components/shell";

const FILTERS = [
  { id: "", label: "All" },
  { id: "needs_you", label: "Needs you" },
  { id: "unread", label: "Unread" },
  { id: "drafts", label: "Drafts" },
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
  const tour = useTour();
  const selected = sp.get("c");
  const [filter, setFilter] = useState(sp.get("filter") === "handoff" ? "needs_you" : sp.get("filter") ?? "");
  const [model, setModel] = useState(sp.get("model") ?? "");
  const { auto } = useShell();
  const models = auto?.accounts ?? [];
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [details, setDetails] = useState(false);
  const [hideDemo, setHideDemo] = useState(false);
  useEffect(() => setHideDemo(localStorage.getItem("ci.hideDemo") === "1"), []);
  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q), 250);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    const f = sp.get("filter");
    if (f != null) setFilter(f === "handoff" ? "needs_you" : f);
  }, [sp]);
  useEffect(() => {
    const m = sp.get("model");
    if (m != null) setModel(m);
  }, [sp]);
  const listUrl = useMemo(() => `/api/conversations?filter=${filter}&q=${encodeURIComponent(qDebounced)}${model ? `&account=${model}` : ""}`, [filter, qDebounced, model]);
  const list = useApi<any[]>(listUrl, { poll: tour.active ? 1200 : 4000 });
  const detail = useApi<any>(selected ? `/api/conversations/${selected}` : null, { poll: tour.active ? 1200 : 3000 });
  // During the tour the demo is always visible, even if demo chats are hidden in Preferences.
  const rows = (list.data ?? []).filter((c) => !hideDemo || !c.account.isSimulated || c.isTour);

  const open = (id: string | null) => {
    const p = new URLSearchParams(sp.toString());
    if (id) p.set("c", id);
    else p.delete("c");
    p.delete("filter");
    setDetails(false);
    router.push(`/inbox?${p.toString()}`, { scroll: false });
    if (id && rows.find((r) => r.id === id)?.isTour) tour.signal("open-convo");
  };

  return (
    <div className="flex h-[calc(100dvh-3.5rem-4rem)] lg:h-dvh">
      {/* Conversation list */}
      <section aria-label="Conversations" data-tour="inbox-list" className={cn("flex w-full flex-col border-r border-line bg-panel/30 md:w-[340px] md:shrink-0", selected && "hidden md:flex")}>
        <div className="space-y-3 px-4 pb-3 pt-4">
          <div className="flex items-center justify-between">
            <h1 className="text-[17px] font-semibold tracking-[-0.015em]">Inbox</h1>
            {list.data && <span className="text-xs text-faint">{rows.length} conversation{rows.length === 1 ? "" : "s"}</span>}
          </div>
          {models.length > 1 && (
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5" role="tablist" aria-label="Model" data-tour="model-picker">
              <button type="button" role="tab" aria-selected={!model} onClick={() => setModel("")} className={cn("flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12.5px] font-medium transition-colors", !model ? "border-accent/50 bg-accent/10 text-fg" : "border-line text-muted hover:text-fg")}>
                All models
              </button>
              {models.map((m) => (
                <button key={m.id} type="button" role="tab" aria-selected={model === m.id} onClick={() => setModel(m.id)} className={cn("flex shrink-0 items-center gap-1.5 rounded-lg border py-1 pl-1 pr-2.5 text-[12.5px] font-medium transition-colors", model === m.id ? "border-accent/50 bg-accent/10 text-fg" : "border-line text-muted hover:text-fg")}>
                  <Avatar name={m.displayName} size={20} />
                  {m.displayName.replace(" (Demo)", "")}
                  <span className={cn("size-1.5 rounded-full", m.mode === "AUTO" ? "bg-ok" : m.mode === "DRAFT" ? "bg-accent" : "bg-faint")} title={m.mode === "AUTO" ? "Auto-reply on" : m.mode === "DRAFT" ? "Drafts" : "AI off"} />
                </button>
              ))}
            </div>
          )}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-faint" aria-hidden />
            <Input aria-label="Search customers" placeholder="Search by name" value={q} onChange={(e) => setQ(e.target.value)} className="h-9 pl-9" />
            {q && (
              <button type="button" aria-label="Clear search" onClick={() => setQ("")} className="absolute right-2.5 top-2.5 text-faint hover:text-fg">
                <X className="size-4" />
              </button>
            )}
          </div>
          <div className="-mx-1 flex gap-1 overflow-x-auto px-1" role="tablist" aria-label="Show">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={filter === f.id}
                onClick={() => setFilter(f.id)}
                className={cn("shrink-0 rounded-full px-3 py-1 text-[12.5px] font-medium transition-colors", filter === f.id ? "bg-fg text-bg" : "text-muted hover:bg-panel-2 hover:text-fg")}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-3">
          {list.loading && !list.data && (
            <div className="space-y-1 p-2">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="flex gap-3 p-2">
                  <Skeleton className="size-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3.5 w-32" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                </div>
              ))}
            </div>
          )}
          {list.error && <div className="p-2"><ErrorBox error={list.error} retry={list.reload} /></div>}
          {list.data && rows.length === 0 && (
            <div className="p-2">
              <Empty icon={<InboxIcon className="size-5" />} title={filter === "needs_you" ? "Nobody needs you right now" : q ? "No matches" : "No conversations yet"}>
                {filter === "needs_you" ? "When a customer needs a person, they'll show up here." : q ? "Try a different name." : "Connect your account in Settings, or start the guided tour to see a demo conversation."}
              </Empty>
            </div>
          )}
          <ul className="space-y-0.5">
            {rows.map((c) => (
              <li key={c.id}>
                <ConversationRow c={c} selected={selected === c.id} onOpen={() => open(c.id)} showModel={!model && models.length > 1} />
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Conversation */}
      <section aria-label="Conversation" className={cn("min-w-0 flex-1 flex-col", selected ? "flex" : "hidden md:flex")}>
        {!selected && (
          <div className="m-auto max-w-sm p-6 text-center">
            <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-panel-2 text-muted">
              <InboxIcon className="size-5" aria-hidden />
            </div>
            <p className="text-[15px] font-medium">Pick a conversation</p>
            <p className="mt-1 text-[13px] text-muted">Messages, AI drafts and controls open here. Customer details are one click away.</p>
          </div>
        )}
        {selected && detail.loading && !detail.data && <Loading label="Opening conversation…" />}
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
            onDetails={() => setDetails((v) => !v)}
            detailsOpen={details}
          />
        )}
      </section>

      {/* Customer details drawer */}
      {selected && detail.data && details && (
        <>
          <div className="fixed inset-0 z-40 animate-fade-in bg-black/50 xl:hidden" onClick={() => setDetails(false)} aria-hidden />
          <aside aria-label="Customer details" className="fixed inset-y-0 right-0 z-50 w-full max-w-[380px] animate-slide-in-right overflow-y-auto border-l border-line bg-panel shadow-2xl xl:static xl:z-auto xl:w-[360px] xl:shrink-0 xl:shadow-none">
            <CustomerPanel c={detail.data} reload={detail.reload} onClose={() => setDetails(false)} />
          </aside>
        </>
      )}
    </div>
  );
}

function ConversationRow({ c, selected, onOpen, showModel }: { c: any; selected: boolean; onOpen: () => void; showModel?: boolean }) {
  const unread = c.unread > 0;
  const status = c.handoff
    ? { label: "Needs you", cls: "bg-warn/12 text-warn" }
    : c.draft?.status === "UNCERTAIN"
      ? { label: "Check delivery", cls: "bg-danger/12 text-danger" }
      : c.draft?.status === "QUEUED"
        ? { label: `Sends ${ago(c.draft.scheduledFor)}`, cls: "bg-ok/12 text-ok" }
        : c.draft?.status === "PROPOSED" && c.draft.nextAction !== "WAIT"
          ? { label: "Draft ready", cls: "bg-accent/14 text-accent-strong" }
          : c.takenOver
            ? { label: "You're handling", cls: "bg-panel-3 text-muted" }
            : c.mode === "PAUSED"
              ? { label: "AI paused", cls: "bg-panel-3 text-muted" }
              : null;
  return (
    <button
      type="button"
      onClick={onOpen}
      data-tour={c.isTour ? "tour-convo" : undefined}
      aria-current={selected || undefined}
      className={cn("group relative flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors", selected ? "bg-panel-3" : "hover:bg-panel-2")}
    >
      <div className="relative">
        <Avatar name={c.customer.name} size={40} />
        {unread && <span className="absolute -right-0.5 -top-0.5 size-3 rounded-full bg-accent ring-[2.5px] ring-bg" aria-label="New message" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={cn("truncate text-[14px]", unread ? "font-semibold text-fg" : "font-medium text-fg/90")}>{c.customer.name}</span>
          {showModel ? <span className="shrink-0 truncate text-[11px] text-faint">· {c.account.name.replace(" (Demo)", "")}</span> : c.account.isSimulated && <SimBadge />}
          <span className={cn("ml-auto shrink-0 text-[11.5px]", unread ? "text-accent" : "text-faint")}>{ago(c.lastMessage?.at).replace(" ago", "")}</span>
        </div>
        <p className={cn("mt-0.5 truncate text-[13px]", unread ? "text-fg/80" : "text-muted")}>
          {c.lastMessage?.direction === "OUTBOUND" && <span className="text-faint">You: </span>}
          {c.lastMessage?.body ?? "No messages yet"}
        </p>
        {status && <span className={cn("mt-1.5 inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium", status.cls)}>{status.label}</span>}
      </div>
    </button>
  );
}
