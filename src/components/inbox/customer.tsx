"use client";
import { useState, type ReactNode } from "react";
import { ChevronDown, X } from "lucide-react";
import { Avatar, Badge, Button, cn, Dialog, Field, InfoTip, Input, Notice, Select, SimBadge, Switch, TechDetails, Textarea, useAction } from "../ui";
import { ago, money, post } from "@/lib/client";

const OUTCOMES = [
  { value: "NONE", label: "No status yet" },
  { value: "CONTACTED", label: "Contacted" },
  { value: "INTERESTED", label: "Interested" },
  { value: "PURCHASED", label: "Purchased" },
  { value: "DECLINED", label: "Not interested" },
  { value: "NO_RESPONSE", label: "No response" },
];
const SIGNAL_TEXT: Record<string, string> = {
  price_question: "Asked about a price",
  catalog_question: "Asked about content",
  purchase_interest: "Said they'd like to buy",
  prior_purchase: "Bought before",
  recent_engagement: "Chatting actively",
  decline: "Said no thanks",
};

function interestWord(n: number) {
  return n >= 70 ? "Very interested" : n >= 40 ? "Interested" : n >= 15 ? "A little interested" : "No signs yet";
}

function Section({ title, children, defaultOpen = true, info, count }: { title: string; children: ReactNode; defaultOpen?: boolean; info?: ReactNode; count?: number }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-t border-line">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between px-5 py-3.5 text-left hover:bg-panel-2/50">
        <span className="flex items-center gap-1.5 text-[13px] font-semibold">
          {title}
          {count != null && count > 0 && <span className="text-xs font-normal text-faint">{count}</span>}
          {info && <InfoTip>{info}</InfoTip>}
        </span>
        <ChevronDown className={cn("size-4 text-faint transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && <div className="animate-fade-in px-5 pb-4">{children}</div>}
    </section>
  );
}

export function CustomerPanel({ c, reload, onClose }: { c: any; reload: () => void; onClose?: () => void }) {
  const cu = c.customer;
  const { busy, run } = useAction();
  const [note, setNote] = useState("");
  const [pref, setPref] = useState("");
  const [tagText, setTagText] = useState(c.tags.join(", "));
  const [summary, setSummary] = useState(c.summary ?? "");
  const [offerOpen, setOfferOpen] = useState(false);
  const updateCustomer = (key: string, body: object, ok: string) => run(key, () => post(`/api/customers/${cu.id}`, body).then(reload), ok);
  const suppressed = cu.suppressedUntil && new Date(cu.suppressedUntil) > new Date();

  return (
    <div className="pb-10 text-[13px]">
      <div className="flex items-start justify-between gap-3 px-5 pb-5 pt-5">
        <div className="flex items-center gap-3">
          <Avatar name={cu.name} size={48} />
          <div>
            <p className="flex items-center gap-2 text-[16px] font-semibold tracking-[-0.01em]">
              {cu.name} {c.account.isSimulated && <SimBadge />}
            </p>
            <p className="text-xs text-muted">{OUTCOMES.find((o) => o.value === cu.outcome)?.label}</p>
          </div>
        </div>
        {onClose && (
          <Button size="icon-sm" variant="ghost" onClick={onClose} aria-label="Close details">
            <X className="size-4" />
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 px-5 pb-5">
        <div className="rounded-xl bg-panel-2 px-3 py-2.5">
          <p className="flex items-center gap-1 text-[11.5px] text-faint">
            Interest
            <InfoTip>A ranking based on what this customer said recently, like asking about prices. It fades over time. It is not a prediction that they will buy.</InfoTip>
          </p>
          <p className="mt-1 text-[15px] font-semibold tabular-nums">{cu.intent}<span className="text-xs font-normal text-faint">/100</span></p>
          <p className="text-[11px] text-muted">{interestWord(cu.intent)}</p>
        </div>
        <div className="rounded-xl bg-panel-2 px-3 py-2.5">
          <p className="flex items-center gap-1 text-[11.5px] text-faint">
            Spent
            <InfoTip>Only purchases confirmed by a transaction record count here.</InfoTip>
          </p>
          <p className="mt-1 text-[15px] font-semibold tabular-nums">{money(cu.verifiedSpendCents)}</p>
          <p className="text-[11px] text-muted">{c.account.isSimulated ? "Demo purchases" : "Verified"}</p>
        </div>
      </div>

      {c.handoffs.some((h: any) => h.status !== "RESOLVED") && (
        <div className="px-5 pb-4">
          <Notice tone="warn" title="Needs a person">
            {c.handoffs.find((h: any) => h.status !== "RESOLVED")?.reason}
          </Notice>
        </div>
      )}

      <Section title="Why they're ranked here" count={cu.signals.length} info="Every point of the interest score comes from something the customer actually wrote.">
        {cu.signals.length === 0 ? (
          <p className="text-muted">No buying signals yet.</p>
        ) : (
          <ul className="space-y-2">
            {cu.signals.map((s: any) => (
              <li key={s.id} className="rounded-lg bg-panel-2/60 px-3 py-2">
                <p className="flex items-center justify-between gap-2">
                  <span className="font-medium">{SIGNAL_TEXT[s.signal] ?? s.signal.replace(/_/g, " ")}</span>
                  <span className={cn("text-xs tabular-nums", s.weight >= 0 ? "text-ok" : "text-danger")}>{s.weight >= 0 ? "+" : ""}{s.weight}</span>
                </p>
                <p className="mt-0.5 text-xs text-muted">“{s.evidence}” · {ago(s.at)}</p>
              </li>
            ))}
          </ul>
        )}
        <Button size="xs" variant="ghost" className="mt-2" onClick={() => updateCustomer("reset", { resetIntent: true }, "Interest score reset")}>Reset score</Button>
      </Section>

      <Section title="Status & contact">
        <div className="space-y-3">
          <Field label="Status">
            {(id) => <Select id={id} value={cu.outcome} onChange={(e) => updateCustomer("outcome", { outcome: e.target.value }, "Status updated")} options={OUTCOMES} />}
          </Field>
          <div className="flex items-center justify-between gap-3">
            <span>
              <span className="block font-medium">Do not contact</span>
              <span className="block text-xs text-muted">The AI and offers stay away from this customer.</span>
            </span>
            <Switch label="Do not contact" checked={cu.doNotContact} onChange={(v) => updateCustomer("dnc", { doNotContact: v }, v ? "We won't contact this customer" : "Contact allowed again")} />
          </div>
          {suppressed && (
            <Notice tone="info">
              They said no recently, so offers are paused until {new Date(cu.suppressedUntil).toLocaleDateString()}.{" "}
              <button type="button" className="underline" onClick={() => updateCustomer("sup", { clearSuppression: true }, "Offers allowed again")}>Allow offers now</button>
            </Notice>
          )}
        </div>
      </Section>

      <Section title="Purchases & offers" count={cu.purchases.length + cu.offers.length} defaultOpen={cu.purchases.length + cu.offers.length > 0}>
        <ul className="space-y-1.5">
          {cu.purchases.length + cu.offers.length === 0 && <li className="text-muted">Nothing yet.</li>}
          {cu.purchases.map((p: any) => (
            <li key={p.id} className="flex items-center justify-between gap-2">
              <span className="truncate">{p.item}</span>
              <span className="flex shrink-0 items-center gap-1.5 tabular-nums">
                {money(p.amountCents)} {p.verified ? <Badge tone="ok">Verified</Badge> : <Badge tone="warn">Unverified</Badge>}
              </span>
            </li>
          ))}
          {cu.offers.map((o: any) => (
            <li key={o.id} className="flex items-center justify-between gap-2">
              <span className="truncate">Offer: {o.item} · {money(o.priceCents)}</span>
              <OfferActions o={o} customerId={cu.id} reload={reload} />
            </li>
          ))}
        </ul>
        <Button size="sm" className="mt-3" onClick={() => setOfferOpen(true)} disabled={cu.doNotContact}>Prepare an offer</Button>
        <p className="mt-2 text-[11.5px] text-faint">Source: {cu.completeness.purchaseData}.</p>
        <OfferDialog open={offerOpen} onClose={() => setOfferOpen(false)} c={c} reload={reload} />
      </Section>

      <Section title="Notes" count={c.notes.length} info="Only your team can see notes. Customers never do.">
        <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); if (note.trim()) run("note", () => post(`/api/conversations/${c.id}`, { action: "note", body: note }).then(() => { setNote(""); reload(); }), "Note saved"); }}>
          <Textarea aria-label="New note" placeholder="Add a private note…" value={note} onChange={(e) => setNote(e.target.value)} className="min-h-16" />
          <Button size="sm" type="submit" loading={busy === "note"} disabled={!note.trim()}>Save note</Button>
        </form>
        <ul className="mt-3 space-y-2">
          {c.notes.map((n: any) => (
            <li key={n.id} className="rounded-lg bg-panel-2/60 px-3 py-2">
              <p className="whitespace-pre-wrap">{n.body}</p>
              <p className="mt-1 text-[11px] text-faint">{n.by} · {ago(n.at)}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="What the AI knows about this chat" defaultOpen={false} info="A short summary and preferences help the AI stay on topic. Keep them to service details, like language.">
        <div className="space-y-4">
          <Field label="Summary" optional hint="The AI reads this before writing. Keep it short.">
            {(id) => <Textarea id={id} value={summary} maxLength={1000} placeholder="e.g. New subscriber, likes the hiking sets" onChange={(e) => setSummary(e.target.value)} onBlur={() => summary !== (c.summary ?? "") && run("sum", () => post(`/api/conversations/${c.id}`, { action: "summary", summary: summary || null }).then(reload), "Summary saved")} />}
          </Field>
          <div>
            <p className="text-[13px] font-medium">Preferences</p>
            <ul className="mt-1.5 space-y-1">
              {(Array.isArray(cu.preferences) ? cu.preferences : []).map((p: any, i: number) => (
                <li key={i} className="flex items-center justify-between gap-2 text-xs">
                  <span>{p.value} <span className="text-faint">({p.source})</span></span>
                  <button type="button" className="text-faint hover:text-danger" onClick={() => updateCustomer("pref", { removePreferenceIndex: i }, "Removed")}>Remove</button>
                </li>
              ))}
            </ul>
            <form className="mt-2 flex gap-1.5" onSubmit={(e) => { e.preventDefault(); if (pref.trim()) updateCustomer("pref", { addPreference: pref }, "Preference added").then(() => setPref("")); }}>
              <Input aria-label="Add preference" placeholder="e.g. prefers Spanish" value={pref} onChange={(e) => setPref(e.target.value)} />
              <Button size="md" type="submit">Add</Button>
            </form>
          </div>
          <Field label="Tags" optional hint="Separate with commas. The tag “manual-only” keeps the AI out of this chat.">
            {(id) => <Input id={id} value={tagText} onChange={(e) => setTagText(e.target.value)} onBlur={() => run("tags", () => post(`/api/conversations/${c.id}`, { action: "tags", tags: tagText.split(",").map((t: string) => t.trim()).filter(Boolean) }).then(reload), "Tags saved")} />}
          </Field>
        </div>
      </Section>

      {c.handoffs.length > 0 && (
        <Section title="History of handoffs" count={c.handoffs.length} defaultOpen={false}>
          <ul className="space-y-1.5">
            {c.handoffs.map((h: any) => (
              <li key={h.id} className="text-xs">
                <Badge tone={h.status === "RESOLVED" ? "neutral" : "warn"}>{h.status === "RESOLVED" ? "Handled" : "Open"}</Badge> <span className="text-muted">{h.reason}</span> <span className="text-faint">· {ago(h.createdAt)}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <div className="border-t border-line px-5 pt-3">
        <TechDetails>Customer id {cu.externalId}{cu.variant ? ` · experiment group ${cu.variant}` : ""} · engagement {cu.engagement}</TechDetails>
      </div>
    </div>
  );
}

function OfferActions({ o, customerId, reload }: { o: any; customerId: string; reload: () => void }) {
  const { run } = useAction();
  const [confirm, setConfirm] = useState(false);
  const [price, setPrice] = useState("");
  const call = (body: object, ok: string) => run("o", () => post("/api/offers", body).then(reload), ok);
  const STATUS: Record<string, string> = { PROPOSED: "Prepared", APPROVED: "Approved", SENT: "Sent", PURCHASED: "Bought", DECLINED: "Declined", EXPIRED: "Expired", INVALIDATED: "Changed" };
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <Badge tone={o.status === "PURCHASED" ? "ok" : o.status === "DECLINED" ? "danger" : "neutral"}>{STATUS[o.status] ?? o.status.toLowerCase()}</Badge>
      {o.status === "PROPOSED" && <button type="button" className="text-xs text-accent hover:underline" onClick={() => setConfirm(true)}>Approve</button>}
      {o.status === "APPROVED" && <button type="button" className="text-xs text-accent hover:underline" onClick={() => call({ action: "mark_sent", offerId: o.id }, "Marked as sent")}>Mark sent</button>}
      {o.status === "SENT" && <button type="button" className="text-xs text-muted hover:underline" onClick={() => call({ action: "status", offerId: o.id, status: "DECLINED" }, "Recorded as declined")}>Declined</button>}
      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Approve this offer"
        description="Type the price to confirm. If anything changes later, you'll be asked to approve again."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => { setConfirm(false); call({ action: "approve", offerId: o.id, confirm: { customerId, externalAssetId: o.externalAssetId, priceCents: Math.round(Number(price) * 100) } }, "Approved. Send it on the platform, then mark it sent."); }}>Approve</Button>
          </>
        }
      >
        <dl className="grid grid-cols-2 gap-1.5 text-[13px]">
          <dt className="text-muted">Item</dt><dd>{o.item}</dd>
          <dt className="text-muted">Price on record</dt><dd>{money(o.priceCents)}</dd>
        </dl>
        <Field label="Type the price to confirm (USD)">{(id) => <Input id={id} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />}</Field>
        <p className="text-xs text-faint">Paid messages are sent by you on the platform. This app never sends them.</p>
      </Dialog>
    </span>
  );
}

function OfferDialog({ open, onClose, c, reload }: { open: boolean; onClose: () => void; c: any; reload: () => void }) {
  const { busy, run } = useAction();
  const [item, setItem] = useState("");
  const [price, setPrice] = useState("");
  const [repeat, setRepeat] = useState(false);
  const [override, setOverride] = useState(false);
  const sel = c.catalog.find((i: any) => i.id === item);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Prepare an offer"
      description="Pick an item from your catalog. You'll approve it before anything happens."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy === "p"} disabled={!item || !price} onClick={() => run("p", () => post("/api/offers", { action: "propose", customerId: c.customer.id, catalogItemId: item, priceCents: Math.round(Number(price) * 100), allowRepeat: repeat, overrideSuppression: override }).then(() => { onClose(); reload(); }), "Offer prepared. Approve it when you're ready.")}>Prepare</Button>
        </>
      }
    >
      <Field label="Item">
        {(id) => (
          <Select id={id} value={item} onChange={(e) => { setItem(e.target.value); const it = c.catalog.find((i: any) => i.id === e.target.value); if (it?.priceCents) setPrice((it.priceCents / 100).toFixed(2)); }} options={[{ value: "", label: "Choose an item…" }, ...c.catalog.map((i: any) => ({ value: i.id, label: `${i.title}${i.priceConfirmed ? ` · ${money(i.priceCents)}` : " · price not set"}` }))]} />
        )}
      </Field>
      <Field label="Price (USD)" hint={sel && !sel.priceConfirmed ? "This item has no confirmed price yet. Double-check it." : undefined}>
        {(id) => <Input id={id} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />}
      </Field>
      <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" className="accent-[var(--color-accent)]" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} /> They already bought this; offer it again anyway</label>
      <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" className="accent-[var(--color-accent)]" checked={override} onChange={(e) => setOverride(e.target.checked)} /> They said no recently; offer anyway</label>
      <p className="text-xs text-faint">No made-up discounts, deadlines or exclusivity. Only real catalog items and prices.</p>
    </Dialog>
  );
}
