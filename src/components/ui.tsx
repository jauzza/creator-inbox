"use client";
import { cva, type VariantProps } from "class-variance-authority";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { createContext, useCallback, useContext, useEffect, useId, useState, type ReactNode } from "react";
import { Loader2, X } from "lucide-react";

// shadcn-style primitives (cva + tailwind-merge), hand-written; see RESEARCH.md §5.
export const cn = (...c: ClassValue[]) => twMerge(clsx(c));

const button = cva(
  "inline-flex items-center justify-center gap-1.5 rounded-md text-[13px] font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap select-none",
  {
    variants: {
      variant: {
        primary: "bg-accent text-[#06231d] hover:bg-accent-strong",
        secondary: "bg-panel-2 text-fg border border-line-strong hover:bg-line",
        ghost: "text-muted hover:text-fg hover:bg-panel-2",
        danger: "bg-danger/15 text-danger border border-danger/40 hover:bg-danger/25",
        warn: "bg-warn/15 text-warn border border-warn/40 hover:bg-warn/25",
      },
      size: { sm: "h-7 px-2.5", md: "h-9 px-3.5", icon: "h-8 w-8" },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export function Button({ className, variant, size, loading, children, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof button> & { loading?: boolean }) {
  return (
    <button className={cn(button({ variant, size }), className)} disabled={loading || p.disabled} {...p}>
      {loading && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function Card({ className, title, actions, children, description }: { className?: string; title?: ReactNode; actions?: ReactNode; description?: ReactNode; children?: ReactNode }) {
  return (
    <section className={cn("rounded-lg border border-line bg-panel", className)}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">
            {title && <h2 className="text-[13px] font-semibold tracking-wide text-fg">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

const badge = cva("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide border", {
  variants: {
    tone: {
      neutral: "border-line-strong text-muted bg-panel-2",
      ok: "border-ok/40 text-ok bg-ok/10",
      warn: "border-warn/40 text-warn bg-warn/10",
      danger: "border-danger/40 text-danger bg-danger/10",
      info: "border-info/40 text-info bg-info/10",
      accent: "border-accent/40 text-accent bg-accent/10",
    },
  },
  defaultVariants: { tone: "neutral" },
});
export function Badge({ tone, className, children, title }: VariantProps<typeof badge> & { className?: string; children: ReactNode; title?: string }) {
  return (
    <span className={cn(badge({ tone }), className)} title={title}>
      {children}
    </span>
  );
}

export const MODE_TONE = { AUTO: "ok", DRAFT: "info", MANUAL: "warn", PAUSED: "danger" } as const;
export const MODE_LABEL = { AUTO: "Auto", DRAFT: "Draft", MANUAL: "Manual", PAUSED: "Paused" } as const;
export function ModeBadge({ mode, large }: { mode: keyof typeof MODE_TONE; large?: boolean }) {
  return (
    <Badge tone={MODE_TONE[mode]} className={large ? "px-2.5 py-1 text-xs" : undefined}>
      {MODE_LABEL[mode]}
    </Badge>
  );
}

export function SimBadge() {
  return (
    <Badge tone="accent" title="Simulated data: nothing is sent to a real platform">
      Simulator
    </Badge>
  );
}

const inputCls = "w-full rounded-md border border-line-strong bg-bg px-2.5 py-1.5 text-[13px] text-fg placeholder:text-faint focus:border-accent focus:outline-none";
export function Input(p: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} className={cn(inputCls, "h-9", p.className)} />;
}
export function Textarea(p: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...p} className={cn(inputCls, "min-h-20 resize-y", p.className)} />;
}
export function Select({ options, ...p }: React.SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string }[] }) {
  return (
    <select {...p} className={cn(inputCls, "h-9", p.className)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Field({ label, hint, children, error }: { label: string; hint?: ReactNode; error?: string | null; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-xs font-medium text-muted">
        {label}
      </label>
      {children(id)}
      {hint && <p className="text-[11px] text-faint">{hint}</p>}
      {error && <p className="text-[11px] text-danger">{error}</p>}
    </div>
  );
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn("relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors disabled:opacity-50", checked ? "border-accent bg-accent/70" : "border-line-strong bg-panel-2")}
    >
      <span className={cn("inline-block size-3.5 rounded-full bg-fg transition-transform", checked ? "translate-x-[18px]" : "translate-x-[3px]")} />
    </button>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line px-6 py-10 text-center">
      <p className="text-sm font-medium text-fg">{title}</p>
      {children && <div className="max-w-md text-xs text-muted">{children}</div>}
      {action}
    </div>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 p-6 text-xs text-muted" role="status">
      <Loader2 className="size-4 animate-spin" aria-hidden /> {label}
    </div>
  );
}

export function ErrorBox({ error, retry }: { error: string; retry?: () => void }) {
  return (
    <div role="alert" className="flex items-center justify-between gap-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
      <span>{error}</span>
      {retry && (
        <Button size="sm" variant="ghost" onClick={retry}>
          Retry
        </Button>
      )}
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "danger" | "ok"; children: ReactNode }) {
  const c = { info: "border-info/40 bg-info/10 text-info", warn: "border-warn/40 bg-warn/10 text-warn", danger: "border-danger/40 bg-danger/10 text-danger", ok: "border-ok/40 bg-ok/10 text-ok" }[tone];
  return <div className={cn("rounded-md border px-3 py-2 text-xs leading-relaxed", c)}>{children}</div>;
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "ok" | "warn" | "danger" }) {
  return (
    <div className="rounded-lg border border-line bg-panel px-4 py-3">
      <p className="text-[11px] uppercase tracking-wider text-faint">{label}</p>
      <p className={cn("mt-1 text-2xl font-semibold tabular-nums", tone === "warn" && "text-warn", tone === "danger" && "text-danger", tone === "ok" && "text-ok")}>{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={cn("-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-[13px]", value === t.id ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg")}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Dialog({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} className="max-h-[90dvh] w-full overflow-y-auto rounded-t-xl border border-line-strong bg-panel sm:max-w-lg sm:rounded-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          <Button size="icon" variant="ghost" onClick={onClose} aria-label="Close">
            <X className="size-4" />
          </Button>
        </div>
        <div className="space-y-3 p-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
}

type Toast = { id: number; text: string; tone: "ok" | "danger" | "info" };
const ToastCtx = createContext<(text: string, tone?: Toast["tone"]) => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: Toast["tone"] = "ok") => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, text, tone }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), tone === "danger" ? 7000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-4 left-1/2 z-[60] flex w-[min(92vw,420px)] -translate-x-1/2 flex-col gap-2">
        {items.map((t) => (
          <div key={t.id} className={cn("pointer-events-auto rounded-md border px-3 py-2 text-[13px] shadow-lg", t.tone === "danger" ? "border-danger/50 bg-[#2a1716] text-danger" : t.tone === "info" ? "border-info/40 bg-[#152030] text-info" : "border-ok/40 bg-[#14231a] text-ok")}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/** Run an async action with loading + toast feedback. */
export function useAction() {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const run = useCallback(
    async <T,>(key: string, fn: () => Promise<T>, okText?: string | ((r: T) => string)): Promise<T | undefined> => {
      setBusy(key);
      try {
        const r = await fn();
        if (okText) toast(typeof okText === "function" ? okText(r) : okText);
        return r;
      } catch (e) {
        toast(e instanceof Error ? e.message : String(e), "danger");
      } finally {
        setBusy(null);
      }
    },
    [toast],
  );
  return { busy, run };
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-0.5 max-w-3xl text-[13px] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Table({ head, children, empty }: { head: ReactNode[]; children: ReactNode; empty?: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full min-w-[640px] text-left text-[13px]">
        <thead className="bg-panel-2 text-[11px] uppercase tracking-wider text-faint">
          <tr>
            {head.map((h, i) => (
              <th key={i} className="px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
      {empty}
    </div>
  );
}
