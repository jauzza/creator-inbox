"use client";
import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { Button, cn, Input } from "../ui";

export type StyleData = {
  creatorName: string;
  publicFacts: string[];
  boundaries: string[];
  preferredExpressions: string[];
  avoidPhrases: string[];
  language: string;
  tone: "warm" | "playful" | "confident" | "concise" | "professional";
  formality: number;
  expressiveness: number;
  emoji: "none" | "rare" | "some" | "often";
  lowercase: boolean;
  contractions: boolean;
  casualPunctuation: boolean;
  replyLength: "short" | "medium" | "long";
  goodExamples: { customer: string; reply: string; note?: string }[];
  badExamples: { customer: string; reply: string; note?: string }[];
};

export const PRESETS: { id: StyleData["tone"]; name: string; blurb: string; emoji: string; set: Partial<StyleData> }[] = [
  { id: "warm", name: "Friendly", blurb: "Warm, kind and easy-going", emoji: "😊", set: { tone: "warm", formality: 30, expressiveness: 60, emoji: "rare", replyLength: "short" } },
  { id: "playful", name: "Playful", blurb: "Fun, bubbly, lots of energy", emoji: "✨", set: { tone: "playful", formality: 15, expressiveness: 85, emoji: "often", replyLength: "medium" } },
  { id: "confident", name: "Confident", blurb: "Direct, cool and self-assured", emoji: "😎", set: { tone: "confident", formality: 50, expressiveness: 40, emoji: "rare", replyLength: "short" } },
  { id: "professional", name: "Professional", blurb: "Polished, clear and courteous", emoji: "💼", set: { tone: "professional", formality: 85, expressiveness: 25, emoji: "none", replyLength: "medium", lowercase: false } },
  { id: "concise", name: "Short & sweet", blurb: "Gets to the point, fast", emoji: "⚡", set: { tone: "concise", formality: 40, expressiveness: 30, emoji: "none", replyLength: "short" } },
];

export function ListEditor({ label, items, onChange, placeholder, max }: { label: string; items: string[]; onChange: (v: string[]) => void; placeholder: string; max: number }) {
  const [v, setV] = useState("");
  const add = () => {
    const t = v.trim();
    if (!t || items.length >= max) return;
    onChange([...items, t]);
    setV("");
  };
  return (
    <div>
      <p className="mb-2 text-[13px] font-medium">{label}</p>
      <ul className="space-y-1.5">
        {items.map((it, i) => (
          <li key={i} className="group flex items-center gap-2 rounded-lg border border-line bg-panel-2/40 pr-1 transition-colors focus-within:border-accent">
            <input aria-label={`${label} ${i + 1}`} value={it} onChange={(e) => onChange(items.map((x, k) => (k === i ? e.target.value : x)))} onBlur={(e) => !e.target.value.trim() && onChange(items.filter((_, k) => k !== i))} className="min-w-0 flex-1 bg-transparent px-3 py-2 text-[13px] focus:outline-none" />
            <button type="button" aria-label="Remove" onClick={() => onChange(items.filter((_, k) => k !== i))} className="rounded-md p-1.5 text-faint opacity-60 hover:bg-panel-3 hover:text-danger group-hover:opacity-100">
              <Trash2 className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <Input aria-label={`Add to ${label}`} value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} />
        <Button type="submit" size="md" disabled={!v.trim()}><Plus className="size-3.5" /> Add</Button>
      </form>
    </div>
  );
}


export function ChipEditor({ label, hint, items, onChange, placeholder, tone }: { label: string; hint: string; items: string[]; onChange: (v: string[]) => void; placeholder: string; tone?: "danger" }) {
  const [v, setV] = useState("");
  return (
    <div>
      <p className="text-[13px] font-medium">{label}</p>
      <p className="mb-2.5 text-xs text-faint">{hint}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((it, i) => (
          <span key={i} className={cn("inline-flex items-center gap-1 rounded-full py-1 pl-2.5 pr-1 text-[12.5px]", tone === "danger" ? "border border-line-strong text-muted line-through decoration-faint/70" : "border border-line-strong bg-panel-2 text-fg")}>
            {it}
            <button type="button" aria-label={`Remove ${it}`} onClick={() => onChange(items.filter((_, k) => k !== i))} className="rounded-full p-0.5 opacity-70 hover:bg-black/20 hover:opacity-100">
              <X className="size-3" />
            </button>
          </span>
        ))}
        <form onSubmit={(e) => { e.preventDefault(); const t = v.trim(); if (t && !items.includes(t)) onChange([...items, t.slice(0, 80)]); setV(""); }}>
          <input aria-label={`Add to ${label}`} value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} className="h-7 w-36 rounded-full border border-dashed border-line-strong bg-transparent px-3 text-[12.5px] placeholder:text-faint focus:border-accent focus:outline-none" />
        </form>
      </div>
    </div>
  );
}

