"use client";
import { useState } from "react";
import { Badge, Button, Dialog, Field, Input, Notice, Select, Switch, Textarea, useAction } from "../ui";
import { ago, money, post } from "@/lib/client";

export function CustomerPanel({ c, reload }: { c: any; reload: () => void }) {
  const cu = c.customer;
  const { busy, run } = useAction();
  const [note, setNote] = useState("");
  const [pref, setPref] = useState("");
  const [tagText, setTagText] = useState(c.tags.join(", "));
  const [summary, setSummary] = useState(c.summary ?? "");
  const [offerOpen, setOfferOpen] = useState(false);
  const updateCustomer = (key: string, body: object, ok: string) => run(key, () => post(`/api/customers/${cu.id}`, body).then(reload), ok);

  return (
    <div className="space-y-4 p-4 text-[13px]">
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-faint">Customer</h3>
        <p className="mt-1 font-medium">{cu.name}</p>
        <p className="text-[11px] text-faint">Provider id {cu.externalId}{cu.variant ? ` · experiment ${cu.variant}` : ""}</p>
      </section>

      <section className="rounded-md border border-line p-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold">Intent score</h3>
          <span className="text-lg font-semibold tabular-nums">{cu.intent}</span>
        </div>
        <p className="text-[11px] text-faint">Decaying ranking heuristic (0–100), not a calibrated purchase probability. Engagement ({cu.engagement}) and spending are tracked separately.</p>
        <ul className="mt-2 space-y-1">
          {cu.signals.length === 0 && <li className="text-xs text-muted">No buying signals yet.</li>}
          {cu.signals.map((s: any) => (
            <li key={s.id} className="text-xs">
              <span className={s.weight >= 0 ? "text-ok" : "text-danger"}>{s.weight >= 0 ? "+" : ""}{s.weight}</span> {s.signal.replace(/_/g, " ")}: <span className="text-muted">“{s.evidence}”</span> <span className="text-faint">{ago(s.at)}</span>
            </li>
          ))}
        </ul>
        <Button size="sm" variant="ghost" className="mt-1" onClick={() => updateCustomer("reset", { resetIntent: true }, "Intent reset and signals deleted")}>Reset score & evidence</Button>
      </section>

      <section className="space-y-2">
        <Field label="Outcome">
          {(id) => (
            <Select id={id} value={cu.outcome} onChange={(e) => updateCustomer("outcome", { outcome: e.target.value }, "Outcome updated")} options={["NONE", "CONTACTED", "INTERESTED", "PURCHASED", "DECLINED", "NO_RESPONSE"].map((v) => ({ value: v, label: v.replace("_", " ").toLowerCase() }))} />
          )}
        </Field>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted">Do not contact</span>
          <Switch label="Do not contact" checked={cu.doNotContact} onChange={(v) => updateCustomer("dnc", { doNotContact: v }, v ? "Marked do-not-contact" : "Do-not-contact cleared")} />
        </div>
        {cu.suppressedUntil && new Date(cu.suppressedUntil) > new Date() && (
          <Notice tone="warn">
            Offers suppressed until {new Date(cu.suppressedUntil).toLocaleDateString()} (declined). This takes precedence over intent.{" "}
            <button className="underline" onClick={() => updateCustomer("sup", { clearSuppression: true }, "Suppression cleared")}>Clear</button>
          </Notice>
        )}
      </section>

      <section>
        <h3 className="text-xs font-semibold">Purchases & offers</h3>
        <p className="text-[11px] text-faint">Data source: {cu.completeness.purchaseData}. Verified spend {money(cu.verifiedSpendCents)}.</p>
        <ul className="mt-1 space-y-1">
          {cu.purchases.map((p: any) => (
            <li key={p.id} className="flex justify-between text-xs">
              <span>{p.item}</span>
              <span>
                {money(p.amountCents)} {p.verified ? <Badge tone="ok">verified</Badge> : <Badge tone="warn">unverified</Badge>}
              </span>
            </li>
          ))}
          {cu.offers.map((o: any) => (
            <li key={o.id} className="flex items-center justify-between text-xs">
              <span>Offer: {o.item} · {money(o.priceCents)}</span>
              <OfferActions o={o} customerId={cu.id} reload={reload} />
            </li>
          ))}
        </ul>
        <Button size="sm" className="mt-2" onClick={() => setOfferOpen(true)} disabled={cu.doNotContact}>Prepare offer for review</Button>
        <OfferDialog open={offerOpen} onClose={() => setOfferOpen(false)} c={c} reload={reload} />
      </section>

      <section className="space-y-2">
        <Field label="Conversation tags (comma separated)" hint="Tag “manual-only” excludes this chat from AI drafting.">
          {(id) => <Input id={id} value={tagText} onChange={(e) => setTagText(e.target.value)} onBlur={() => run("tags", () => post(`/api/conversations/${c.id}`, { action: "tags", tags: tagText.split(",").map((t: string) => t.trim()).filter(Boolean) }).then(reload), "Tags saved")} />}
        </Field>
        <Field label="Conversation summary (used as AI context)" hint="Bounded and editable. Keep it to service-relevant facts.">
          {(id) => <Textarea id={id} value={summary} maxLength={1000} onChange={(e) => setSummary(e.target.value)} onBlur={() => summary !== (c.summary ?? "") && run("sum", () => post(`/api/conversations/${c.id}`, { action: "summary", summary: summary || null }).then(reload), "Summary saved")} />}
        </Field>
      </section>

      <section>
        <h3 className="text-xs font-semibold">Preferences the customer shared</h3>
        <p className="text-[11px] text-faint">Service-relevant only (e.g. language). Each has provenance; delete any time.</p>
        <ul className="mt-1 space-y-1">
          {(Array.isArray(cu.preferences) ? cu.preferences : []).map((p: any, i: number) => (
            <li key={i} className="flex items-center justify-between text-xs">
              <span>{p.value} <span className="text-faint">({p.source})</span></span>
              <button className="text-danger hover:underline" onClick={() => updateCustomer("pref", { removePreferenceIndex: i }, "Preference deleted")}>delete</button>
            </li>
          ))}
        </ul>
        <form className="mt-1 flex gap-1" onSubmit={(e) => { e.preventDefault(); if (pref.trim()) updateCustomer("pref", { addPreference: pref }, "Preference added").then(() => setPref("")); }}>
          <Input aria-label="Add preference" placeholder="e.g. prefers Spanish" value={pref} onChange={(e) => setPref(e.target.value)} />
          <Button size="sm" type="submit">Add</Button>
        </form>
      </section>

      <section>
        <h3 className="text-xs font-semibold">Internal notes</h3>
        <form className="mt-1 space-y-1" onSubmit={(e) => { e.preventDefault(); if (note.trim()) run("note", () => post(`/api/conversations/${c.id}`, { action: "note", body: note }).then(() => { setNote(""); reload(); }), "Note added"); }}>
          <Textarea aria-label="Internal note" placeholder="Only visible to your team" value={note} onChange={(e) => setNote(e.target.value)} className="min-h-14" />
          <Button size="sm" type="submit" loading={busy === "note"}>Add note</Button>
        </form>
        <ul className="mt-2 space-y-2">
          {c.notes.map((n: any) => (
            <li key={n.id} className="rounded bg-panel-2 p-2 text-xs">
              <p className="whitespace-pre-wrap">{n.body}</p>
              <p className="mt-1 text-[10px] text-faint">{n.by} · {ago(n.at)}</p>
            </li>
          ))}
        </ul>
      </section>

      {c.handoffs.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold">Handoffs</h3>
          <ul className="mt-1 space-y-1">
            {c.handoffs.map((h: any) => (
              <li key={h.id} className="text-xs">
                <Badge tone={h.status === "RESOLVED" ? "neutral" : "warn"}>{h.status.toLowerCase()}</Badge> {h.reason} {h.evidence && <span className="text-muted">“{h.evidence}”</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function OfferActions({ o, customerId, reload }: { o: any; customerId: string; reload: () => void }) {
  const { run } = useAction();
  const [confirm, setConfirm] = useState(false);
  const [price, setPrice] = useState("");
  const call = (body: object, ok: string) => run("o", () => post("/api/offers", body).then(reload), ok);
  return (
    <span className="flex items-center gap-1">
      <Badge tone={o.status === "PURCHASED" ? "ok" : o.status === "DECLINED" ? "danger" : "neutral"}>{o.status.toLowerCase()}</Badge>
      {o.status === "PROPOSED" && <button className="text-accent hover:underline" onClick={() => setConfirm(true)}>approve</button>}
      {o.status === "APPROVED" && <button className="text-accent hover:underline" onClick={() => call({ action: "mark_sent", offerId: o.id }, "Marked as sent on the platform")}>mark sent</button>}
      {o.status === "SENT" && <button className="text-muted hover:underline" onClick={() => call({ action: "status", offerId: o.id, status: "DECLINED" }, "Recorded as declined")}>declined</button>}
      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Confirm paid offer"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => { setConfirm(false); call({ action: "approve", offerId: o.id, confirm: { customerId, externalAssetId: o.externalAssetId, priceCents: Math.round(Number(price) * 100) } }, "Offer approved. Send it on the platform, then mark sent."); }}>Approve</Button>
          </>
        }
      >
        <p className="text-[13px] text-muted">Re-type the price to confirm. Recipient, asset and price are frozen on approval; any change invalidates it. This build does not send paid messages through the provider. You send it on the platform yourself.</p>
        <dl className="grid grid-cols-2 gap-1 text-xs">
          <dt className="text-muted">Recipient</dt><dd>{customerId.slice(-6)}</dd>
          <dt className="text-muted">Asset</dt><dd>{o.item} ({o.externalAssetId})</dd>
          <dt className="text-muted">Price on record</dt><dd>{money(o.priceCents)}</dd>
        </dl>
        <Field label="Type the price to confirm (USD)">{(id) => <Input id={id} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />}</Field>
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
      title="Prepare an offer (human review)"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy === "p"} disabled={!item || !price} onClick={() => run("p", () => post("/api/offers", { action: "propose", customerId: c.customer.id, catalogItemId: item, priceCents: Math.round(Number(price) * 100), allowRepeat: repeat, overrideSuppression: override }).then(() => { onClose(); reload(); }), "Offer prepared; approve it to freeze details")}>Prepare</Button>
        </>
      }
    >
      <Notice>Only existing catalog items with operator-set prices. No invented discounts, scarcity or exclusivity. Already-purchased items are blocked unless you tick “allow repeat”.</Notice>
      <Field label="Catalog item">
        {(id) => (
          <Select id={id} value={item} onChange={(e) => { setItem(e.target.value); const it = c.catalog.find((i: any) => i.id === e.target.value); if (it?.priceCents) setPrice((it.priceCents / 100).toFixed(2)); }} options={[{ value: "", label: "Choose…" }, ...c.catalog.map((i: any) => ({ value: i.id, label: `${i.title}${i.priceConfirmed ? ` · ${money(i.priceCents)}` : " · price not confirmed"}` }))]} />
        )}
      </Field>
      <Field label="Price (USD)" hint={sel && !sel.priceConfirmed ? "This item has no confirmed price in the catalog. Double-check." : undefined}>
        {(id) => <Input id={id} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />}
      </Field>
      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} /> Allow repeat offer of an already purchased item</label>
      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} /> Override decline cooldown (customer recently said no)</label>
    </Dialog>
  );
}
