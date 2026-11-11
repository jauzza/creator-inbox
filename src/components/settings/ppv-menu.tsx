"use client";
import { useState } from "react";
import { EyeOff, Pencil, Plus, Video } from "lucide-react";
import { Button, cn, Empty, Field, Input, Textarea, useAction } from "../ui";
import { money, post, useApi } from "@/lib/client";
import { useShell } from "../shell";

type Item = { id: string; accountId: string; externalAssetId: string; title: string; description: string; priceCents: number | null; priceConfirmed: boolean; active: boolean };

/**
 * The PPV menu for one model: what the AI may mention, with exact prices. Kept deliberately small.
 * The AI only offers these when the subscriber shows interest, and never re-offers something they bought.
 */
export function PpvMenu({ accountId }: { accountId: string }) {
  const { data, reload } = useApi<{ items: (Item & { account: { displayName: string } })[] }>("/api/catalog");
  const { me } = useShell();
  const owner = me.role === "OWNER";
  const { busy, run } = useAction();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [f, setF] = useState({ title: "", description: "", price: "", externalAssetId: "" });
  const items = (data?.items ?? []).filter((i) => i.accountId === accountId);

  const startEdit = (i?: Item) => {
    setEditing(i?.id ?? "new");
    setF(i ? { title: i.title, description: i.description, price: i.priceCents == null ? "" : (i.priceCents / 100).toFixed(2), externalAssetId: i.externalAssetId } : { title: "", description: "", price: "", externalAssetId: "" });
  };
  const save = (extra: Partial<Item> = {}, target?: Item) =>
    run(
      "save",
      async () => {
        const base = target ?? items.find((i) => i.id === editing);
        const priceCents = f.price.trim() === "" ? null : Math.round(Number(f.price) * 100);
        await post("/api/catalog", {
          action: "upsert",
          id: base?.id,
          item: {
            accountId,
            externalAssetId: (target ? target.externalAssetId : f.externalAssetId.trim()) || `manual_${f.title.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40)}`,
            title: target ? target.title : f.title.trim(),
            description: target ? target.description : f.description.trim(),
            priceCents: target ? target.priceCents : priceCents,
            priceConfirmed: target ? target.priceConfirmed : priceCents != null,
            active: target ? target.active : true,
            ...extra,
          },
        });
        setEditing(null);
        reload();
      },
      "Saved",
    );

  return (
    <div className="space-y-3">
      {items.length === 0 && editing !== "new" && (
        <Empty icon={<Video className="size-5" />} title="No PPV items yet">
          Add the videos or sets this model sells. The AI will only ever mention these, at these prices.
        </Empty>
      )}
      <ul className="space-y-2">
        {items.map((i) =>
          editing === i.id ? (
            <li key={i.id}>{form()}</li>
          ) : (
            <li key={i.id} className={cn("group flex items-start gap-3 rounded-xl border border-line bg-panel-2/40 px-4 py-3", !i.active && "opacity-50")}>
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent/12 text-accent">
                <Video className="size-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-[13.5px] font-medium">
                  {i.title}
                  {!i.active && <span className="text-[11px] font-normal text-faint">Hidden</span>}
                </p>
                <p className="text-[12.5px] text-muted">{i.description}</p>
              </div>
              <span className="shrink-0 text-[14px] font-semibold tabular-nums">{i.priceConfirmed ? money(i.priceCents) : <span className="text-xs font-normal text-faint">No price yet</span>}</span>
              {owner && (
                <span className="flex shrink-0 gap-0.5 opacity-60 group-hover:opacity-100">
                  <Button size="icon-sm" variant="ghost" aria-label={`Edit ${i.title}`} onClick={() => startEdit(i)}>
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button size="icon-sm" variant="ghost" aria-label={i.active ? `Hide ${i.title}` : `Show ${i.title}`} title={i.active ? "Hide from the AI" : "Show to the AI again"} onClick={() => save({ active: !i.active }, i)}>
                    <EyeOff className="size-3.5" />
                  </Button>
                </span>
              )}
            </li>
          ),
        )}
      </ul>
      {editing === "new" ? form() : owner && (
        <Button size="sm" onClick={() => startEdit()}>
          <Plus className="size-3.5" /> Add a PPV item
        </Button>
      )}
    </div>
  );

  function form() {
    return (
      <div className="animate-fade-in space-y-3 rounded-xl border border-accent/30 bg-accent/5 p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
          <Field label="Title">{(id) => <Input id={id} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Skatepark Sunset" />}</Field>
          <Field label="Price (USD)">{(id) => <Input id={id} inputMode="decimal" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} placeholder="15.00" />}</Field>
        </div>
        <Field label="What's in it" hint="A short, non-explicit description the AI can use, e.g. “8-minute video skating at golden hour”.">
          {(id) => <Textarea id={id} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} className="min-h-14" />}
        </Field>
        <details className="text-xs text-faint">
          <summary className="cursor-pointer hover:text-muted">Advanced: platform vault ID</summary>
          <div className="mt-2 max-w-xs">
            <Input aria-label="Vault ID" value={f.externalAssetId} onChange={(e) => setF({ ...f, externalAssetId: e.target.value })} placeholder="Optional" />
          </div>
        </details>
        <div className="flex gap-2">
          <Button size="sm" variant="primary" loading={busy === "save"} disabled={!f.title.trim() || !f.description.trim()} onClick={() => save()}>
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }
}
