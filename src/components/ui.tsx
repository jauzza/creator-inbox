"use client";
import { cva, type VariantProps } from "class-variance-authority";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Info, Loader2, X, XCircle } from "lucide-react";
import { humanize } from "@/lib/client";

// Design-system primitives (cva + tailwind-merge), hand-written in the shadcn style.
export const cn = (...c: ClassValue[]) => twMerge(clsx(c));

const button = cva(
  "relative inline-flex items-center justify-center gap-1.5 rounded-lg text-[13px] font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-150 active:scale-[0.98] disabled:opacity-45 disabled:pointer-events-none whitespace-nowrap select-none",
  {
    variants: {
      variant: {
        primary: "bg-accent text-accent-ink shadow-[0_1px_0_rgb(255_255_255/0.25)_inset,0_6px_20px_-8px_var(--color-accent)] hover:bg-accent-strong",
        secondary: "bg-panel-2 text-fg border border-line-strong hover:bg-panel-3 hover:border-[#3a3a44]",
        ghost: "text-muted hover:text-fg hover:bg-panel-2",
        danger: "bg-danger/12 text-danger border border-danger/35 hover:bg-danger/20",
        warn: "bg-warn/12 text-warn border border-warn/35 hover:bg-warn/20",
        quiet: "text-accent hover:text-accent-strong hover:bg-accent/10",
      },
      size: { xs: "h-7 px-2 text-xs rounded-md", sm: "h-8 px-3", md: "h-9 px-3.5", lg: "h-11 px-5 text-sm", icon: "h-8 w-8", "icon-sm": "h-7 w-7 rounded-md" },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export const buttonVariants = button;

export function Button({ className, variant, size, loading, children, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof button> & { loading?: boolean }) {
  return (
    <button type="button" className={cn(button({ variant, size }), className)} disabled={loading || p.disabled} aria-busy={loading || undefined} {...p}>
      {loading && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function Card({ className, title, actions, children, description, icon, padded = true, id }: { className?: string; title?: ReactNode; actions?: ReactNode; description?: ReactNode; children?: ReactNode; icon?: ReactNode; padded?: boolean; id?: string }) {
  return (
    <section id={id} className={cn("rounded-xl border border-line bg-panel", className)}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3 px-5 pt-4">
          <div className="flex min-w-0 items-start gap-2.5">
            {icon && <span className="mt-0.5 text-muted">{icon}</span>}
            <div className="min-w-0">
              {title && <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-fg">{title}</h2>}
              {description && <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{description}</p>}
            </div>
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn(padded && "p-5", padded && (title || actions) && "pt-4")}>{children}</div>
    </section>
  );
}

const badge = cva("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium leading-4 whitespace-nowrap", {
  variants: {
    tone: {
      neutral: "bg-panel-3 text-muted",
      ok: "bg-ok/12 text-ok",
      warn: "bg-warn/12 text-warn",
      danger: "bg-danger/12 text-danger",
      info: "bg-info/12 text-info",
      accent: "bg-accent/14 text-accent-strong",
    },
  },
  defaultVariants: { tone: "neutral" },
});
export function Badge({ tone, className, children, title, dot }: VariantProps<typeof badge> & { className?: string; children: ReactNode; title?: string; dot?: boolean }) {
  return (
    <span className={cn(badge({ tone }), className)} title={title}>
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

export type Mode = "AUTO" | "DRAFT" | "MANUAL" | "PAUSED";
export const MODE_TONE = { AUTO: "ok", DRAFT: "accent", MANUAL: "warn", PAUSED: "danger" } as const;
export const MODE_LABEL = { AUTO: "Auto-reply", DRAFT: "AI drafts", MANUAL: "Manual", PAUSED: "Paused" } as const;
export const MODE_EXPLAIN = {
  AUTO: "The AI may send safe, simple replies by itself. Everything else waits for you.",
  DRAFT: "The AI writes a draft. Nothing is sent until you approve it.",
  MANUAL: "You write the replies. The AI stays quiet.",
  PAUSED: "The AI is off here. No drafts, no automatic replies.",
} as const;
export function ModeBadge({ mode, large }: { mode: Mode; large?: boolean }) {
  return (
    <Badge tone={MODE_TONE[mode]} dot className={large ? "px-2.5 py-1 text-xs" : undefined} title={MODE_EXPLAIN[mode]}>
      {MODE_LABEL[mode]}
    </Badge>
  );
}

export function SimBadge({ label = "Demo" }: { label?: string }) {
  return (
    <Badge tone="info" title="Demo data from the built-in simulator. Nothing here is sent to a real customer or platform.">
      {label}
    </Badge>
  );
}

const inputCls =
  "w-full rounded-lg border border-line-strong bg-bg/60 px-3 py-2 text-[13px] text-fg placeholder:text-faint transition-colors hover:border-[#3a3a44] focus:border-accent focus:bg-bg focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:opacity-50";
export function Input(p: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} className={cn(inputCls, "h-9", p.className)} />;
}
export function Textarea(p: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...p} className={cn(inputCls, "min-h-20 resize-y leading-relaxed", p.className)} />;
}
export function Select({ options, ...p }: React.SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string }[] }) {
  return (
    <select {...p} className={cn(inputCls, "h-9 cursor-pointer py-0", p.className)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Small "i" button with a short explanation; works with hover, focus and tap. */
export function InfoTip({ children, label = "More information" }: { children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className="relative inline-flex align-middle" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" aria-label={label} aria-describedby={open ? id : undefined} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onClick={() => setOpen((o) => !o)} className="inline-flex size-4 items-center justify-center rounded-full text-faint hover:text-fg">
        <Info className="size-3.5" aria-hidden />
      </button>
      {open && (
        <span id={id} role="tooltip" className="absolute bottom-full left-1/2 z-[120] mb-2 w-64 -translate-x-1/2 animate-fade-in rounded-lg border border-line-strong bg-panel-3 px-3 py-2 text-xs font-normal normal-case leading-relaxed tracking-normal text-fg shadow-2xl">
          {children}
        </span>
      )}
    </span>
  );
}

export function Field({ label, hint, children, error, optional, info }: { label: string; hint?: ReactNode; error?: string | null; optional?: boolean; info?: ReactNode; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <label htmlFor={id} className="text-[13px] font-medium text-fg/90">
          {label}
        </label>
        {optional && <span className="text-[11px] text-faint">Optional</span>}
        {info && <InfoTip label={`About ${label}`}>{info}</InfoTip>}
      </div>
      {children(id)}
      {hint && <p className="text-xs leading-relaxed text-faint">{hint}</p>}
      {error && <p className="text-xs text-danger">{error}</p>}
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
      className={cn("relative inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full transition-colors duration-200 disabled:opacity-50", checked ? "bg-accent" : "bg-panel-3 ring-1 ring-inset ring-line-strong")}
    >
      <span className={cn("inline-block size-4 rounded-full bg-white shadow transition-transform duration-200", checked ? "translate-x-[19px]" : "translate-x-[3px]")} />
    </button>
  );
}

/** A row with a title, explanation and a control on the right (settings pattern). */
export function SettingRow({ title, description, children, optional, info }: { title: ReactNode; description?: ReactNode; children: ReactNode; optional?: boolean; info?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 max-w-xl">
        <p className="flex items-center gap-1.5 text-[13px] font-medium">
          {title}
          {optional && <span className="text-[11px] font-normal text-faint">Optional</span>}
          {info && <InfoTip>{info}</InfoTip>}
        </p>
        {description && <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label, size = "md", className }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; hint?: string }[]; label: string; size?: "sm" | "md"; className?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex rounded-lg bg-panel-2 p-0.5 ring-1 ring-inset ring-line", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.hint}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex-1 rounded-md font-medium whitespace-nowrap transition-all duration-150",
            size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-[13px]",
            value === o.value ? "bg-panel-3 text-fg shadow-[0_1px_2px_rgb(0_0_0/0.4)] ring-1 ring-inset ring-line-strong" : "text-muted hover:text-fg",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Slider({ value, onChange, min = 0, max = 100, step = 1, label, left, right, id }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; label: string; left?: string; right?: string; id?: string }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <input id={id} type="range" className="slider w-full cursor-pointer" min={min} max={max} step={step} value={value} aria-label={label} aria-valuetext={left && right ? (pct < 34 ? left : pct > 66 ? right : "Balanced") : String(value)} onChange={(e) => onChange(Number(e.target.value))} style={{ ["--fill" as string]: `${pct}%` }} />
      {(left || right) && (
        <div className="mt-1.5 flex justify-between text-[11px] text-faint">
          <span>{left}</span>
          <span>{right}</span>
        </div>
      )}
    </div>
  );
}

/** Collapsible section for advanced or technical options; closed by default. */
export function Advanced({ title = "Advanced", description, children, defaultOpen = false, id }: { title?: ReactNode; description?: ReactNode; children: ReactNode; defaultOpen?: boolean; id?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  const cid = useId();
  return (
    <div id={id} className="rounded-xl border border-line bg-panel/60">
      <button type="button" aria-expanded={open} aria-controls={cid} onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-3 rounded-xl px-5 py-3.5 text-left hover:bg-panel-2/50">
        <span>
          <span className="block text-[13px] font-medium">{title}</span>
          {description && <span className="block text-xs text-faint">{description}</span>}
        </span>
        <ChevronDown className={cn("size-4 shrink-0 text-faint transition-transform duration-200", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <div id={cid} className="animate-fade-in border-t border-line p-5">
          {children}
        </div>
      )}
    </div>
  );
}

const AVATAR_HUES = [250, 200, 160, 30, 330, 280, 120, 10];
export function Avatar({ name, size = 36, className }: { name: string; size?: number; className?: string }) {
  const initials = name.replace(/\(.*?\)/g, "").trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = AVATAR_HUES[h % AVATAR_HUES.length];
  return (
    <span aria-hidden className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-semibold", className)} style={{ width: size, height: size, fontSize: size * 0.36, background: `oklch(0.32 0.06 ${hue})`, color: `oklch(0.9 0.07 ${hue})` }}>
      {initials}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-md", className)} aria-hidden />;
}

export function Empty({ title, children, action, icon }: { title: string; children?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line px-6 py-12 text-center">
      {icon && <div className="mb-1 rounded-full bg-panel-2 p-3 text-muted">{icon}</div>}
      <p className="text-sm font-medium text-fg">{title}</p>
      {children && <div className="max-w-sm text-[13px] leading-relaxed text-muted">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 p-6 text-[13px] text-muted" role="status">
      <Loader2 className="size-4 animate-spin" aria-hidden /> {label}
    </div>
  );
}

export function TechDetails({ children, label = "Technical details" }: { children: ReactNode; label?: string }) {
  return (
    <details className="group mt-1.5">
      <summary className="cursor-pointer list-none text-[11px] text-faint hover:text-muted">
        <span className="underline decoration-dotted underline-offset-2">{label}</span>
      </summary>
      <div className="mt-1.5 break-words rounded-md bg-bg/70 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-muted">{children}</div>
    </details>
  );
}

export function ErrorBox({ error, retry }: { error: string; retry?: () => void }) {
  const h = humanize(error);
  return (
    <div role="alert" className="rounded-xl border border-danger/30 bg-danger/8 px-4 py-3 text-[13px]">
      <div className="flex items-start justify-between gap-3">
        <p className="flex items-start gap-2 text-fg">
          <XCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden /> {h.message}
        </p>
        {retry && (
          <Button size="xs" variant="ghost" onClick={retry}>
            Try again
          </Button>
        )}
      </div>
      {h.technical !== h.message && <TechDetails>{h.technical}</TechDetails>}
    </div>
  );
}

export function Notice({ tone = "info", children, title, action }: { tone?: "info" | "warn" | "danger" | "ok"; children: ReactNode; title?: ReactNode; action?: ReactNode }) {
  const c = { info: "border-info/25 bg-info/6", warn: "border-warn/30 bg-warn/7", danger: "border-danger/30 bg-danger/8", ok: "border-ok/25 bg-ok/7" }[tone];
  const Icon = { info: Info, warn: AlertTriangle, danger: XCircle, ok: CheckCircle2 }[tone];
  const ic = { info: "text-info", warn: "text-warn", danger: "text-danger", ok: "text-ok" }[tone];
  return (
    <div className={cn("flex gap-3 rounded-xl border px-4 py-3 text-[13px] leading-relaxed", c)}>
      <Icon className={cn("mt-0.5 size-4 shrink-0", ic)} aria-hidden />
      <div className="min-w-0 flex-1 text-fg/90">
        {title && <p className="font-medium text-fg">{title}</p>}
        <div className={title ? "text-muted" : undefined}>{children}</div>
        {action && <div className="mt-2">{action}</div>}
      </div>
    </div>
  );
}

export function Stat({ label, value, hint, tone, icon }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "ok" | "warn" | "danger"; icon?: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-panel px-4 py-3.5 transition-colors hover:border-line-strong">
      <p className="flex items-center gap-1.5 text-xs text-muted">
        {icon}
        {label}
      </p>
      <p className={cn("mt-1.5 text-[26px] font-semibold leading-none tracking-[-0.02em] tabular-nums", tone === "warn" && "text-warn", tone === "danger" && "text-danger", tone === "ok" && "text-ok")}>{value}</p>
      {hint && <p className="mt-1.5 text-xs text-faint">{hint}</p>}
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
          type="button"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={cn("-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] font-medium transition-colors", value === t.id ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg")}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Dialog({ open, onClose, title, children, footer, description }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; description?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>("input,textarea,select,button[data-autofocus]")?.focus() ?? ref.current?.focus());
    return () => {
      window.removeEventListener("keydown", h);
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex animate-fade-in items-end justify-center bg-black/65 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" onClick={onClose}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className="max-h-[90dvh] w-full animate-pop overflow-y-auto rounded-t-2xl border border-line-strong bg-panel shadow-2xl outline-none sm:max-w-lg sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 px-5 pt-5">
          <div>
            <h2 className="text-[15px] font-semibold tracking-[-0.01em]">{title}</h2>
            {description && <p className="mt-1 text-[13px] text-muted">{description}</p>}
          </div>
          <Button size="icon-sm" variant="ghost" onClick={onClose} aria-label="Close">
            <X className="size-4" />
          </Button>
        </div>
        <div className="space-y-3 px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3.5">{footer}</div>}
      </div>
    </div>
  );
}

type Toast = { id: number; text: string; tone: "ok" | "danger" | "info"; technical?: string };
const ToastCtx = createContext<(text: string, tone?: Toast["tone"], technical?: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: Toast["tone"] = "ok", technical?: string) => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x.slice(-3), { id, text, tone, technical }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), tone === "danger" ? 8000 : 3800);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-20 left-1/2 z-[110] flex w-[min(92vw,420px)] -translate-x-1/2 flex-col gap-2 lg:bottom-5">
        {items.map((t) => (
          <div key={t.id} className="pointer-events-auto flex animate-rise items-start gap-2.5 rounded-xl border border-line-strong bg-panel-3/95 px-4 py-3 text-[13px] shadow-2xl backdrop-blur">
            {t.tone === "danger" ? <XCircle className="mt-0.5 size-4 shrink-0 text-danger" /> : t.tone === "info" ? <Info className="mt-0.5 size-4 shrink-0 text-info" /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" />}
            <div className="min-w-0 flex-1">
              <p>{t.text}</p>
              {t.technical && t.technical !== t.text && <TechDetails>{t.technical}</TechDetails>}
            </div>
            <button type="button" aria-label="Dismiss" className="text-faint hover:text-fg" onClick={() => setItems((x) => x.filter((y) => y.id !== t.id))}>
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/** Run an async action with loading + toast feedback. Errors are shown in plain language. */
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
        const h = humanize(e instanceof Error ? e.message : String(e));
        toast(h.message, "danger", h.technical);
      } finally {
        setBusy(null);
      }
    },
    [toast],
  );
  return { busy, run };
}

export function PageHeader({ title, description, actions, eyebrow }: { title: string; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow && <p className="mb-1 text-xs font-medium text-accent">{eyebrow}</p>}
        <h1 className="text-[22px] font-semibold tracking-[-0.02em]">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-[14px] leading-relaxed text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Table({ head, children, empty }: { head: ReactNode[]; children: ReactNode; empty?: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full min-w-[640px] text-left text-[13px]">
        <thead className="bg-panel-2/70 text-xs text-faint">
          <tr>
            {head.map((h, i) => (
              <th key={i} className="px-3 py-2.5 font-medium">
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

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-line-strong bg-panel-2 px-1 py-px font-mono text-[10px] text-muted">{children}</kbd>;
}
