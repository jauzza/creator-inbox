"use client";
/**
 * Design system: shadcn/ui-style components on Radix primitives (radix-ui), sonner for toasts.
 * Neutral by default: white is the primary colour, and colour is kept for meaning only.
 */
import { cva, type VariantProps } from "class-variance-authority";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { useCallback, useId, useState, type ReactNode } from "react";
import { Collapsible, Dialog as DialogPrimitive, DropdownMenu as DM, Popover, Slider as SliderPrimitive, Switch as SwitchPrimitive, Tabs as TabsPrimitive, ToggleGroup } from "radix-ui";
import { Toaster, toast } from "sonner";
import { AlertTriangle, CheckCircle2, ChevronDown, Info, Loader2, X, XCircle } from "lucide-react";
import { humanize } from "@/lib/client";

export const cn = (...c: ClassValue[]) => twMerge(clsx(c));

const button = cva(
  "relative inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-[13px] font-medium transition-[background-color,border-color,color,box-shadow] duration-150 outline-none focus-visible:ring-2 focus-visible:ring-fg/30 focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:pointer-events-none disabled:opacity-40 select-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-fg text-bg shadow-sm hover:bg-fg/90",
        secondary: "border border-line-strong bg-panel-2 text-fg shadow-sm hover:bg-panel-3",
        outline: "border border-line-strong bg-transparent text-fg hover:bg-panel-2",
        ghost: "text-muted hover:bg-panel-2 hover:text-fg",
        danger: "border border-danger/30 bg-danger/10 text-danger hover:bg-danger/15",
        warn: "border border-line-strong bg-panel-2 text-fg hover:bg-panel-3",
        quiet: "text-fg underline-offset-4 hover:underline",
      },
      size: { xs: "h-7 rounded-md px-2.5 text-xs max-sm:h-8", sm: "h-8 px-3 max-sm:h-9", md: "h-9 px-4 max-sm:h-10", lg: "h-10 px-5 text-sm max-sm:h-11", icon: "size-9 max-sm:size-10", "icon-sm": "size-8 max-sm:size-9" },
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

export function Card({ className, title, actions, children, description, icon, padded = true, id, tour }: { className?: string; title?: ReactNode; actions?: ReactNode; description?: ReactNode; children?: ReactNode; icon?: ReactNode; padded?: boolean; id?: string; tour?: string }) {
  return (
    <section id={id} data-tour={tour} className={cn("rounded-xl border border-line bg-panel shadow-[0_1px_2px_rgb(0_0_0/0.3)]", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5 sm:px-6">
          <div className="flex min-w-0 items-start gap-2.5">
            {icon && <span className="mt-0.5 text-muted">{icon}</span>}
            <div className="min-w-0">
              {title && <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-fg">{title}</h2>}
              {description && <p className="mt-1 text-[13px] leading-relaxed text-muted">{description}</p>}
            </div>
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn(padded && "p-5 sm:p-6", padded && (title || actions) && "pt-4 sm:pt-4")}>{children}</div>
    </section>
  );
}

const DOT = { neutral: "bg-faint", ok: "bg-ok", warn: "bg-warn", danger: "bg-danger", info: "bg-faint", accent: "bg-fg" } as const;
const badge = cva("inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-medium leading-4", {
  variants: {
    tone: {
      neutral: "border-line-strong bg-panel-2 text-muted",
      ok: "border-line-strong bg-panel-2 text-fg",
      warn: "border-line-strong bg-panel-2 text-fg",
      danger: "border-danger/30 bg-danger/10 text-danger",
      info: "border-line-strong bg-panel-2 text-muted",
      accent: "border-line-strong bg-panel-2 text-fg",
    },
  },
  defaultVariants: { tone: "neutral" },
});
/** Neutral pill; when `dot` is set, a small coloured dot carries the meaning instead of the whole badge. */
export function Badge({ tone, className, children, title, dot }: VariantProps<typeof badge> & { className?: string; children: ReactNode; title?: string; dot?: boolean }) {
  return (
    <span className={cn(badge({ tone }), className)} title={title}>
      {dot && <span className={cn("size-1.5 rounded-full", DOT[tone ?? "neutral"])} aria-hidden />}
      {children}
    </span>
  );
}

export type Mode = "AUTO" | "DRAFT" | "MANUAL" | "PAUSED";
export const MODE_TONE = { AUTO: "ok", DRAFT: "accent", MANUAL: "warn", PAUSED: "neutral" } as const;
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

/** Label for practice (simulator) data. Practice accounts never reach a real customer. */
export function SimBadge({ label = "Practice" }: { label?: string }) {
  return (
    <Badge tone="neutral" title="Practice data from the built-in simulator. Nothing here is sent to a real customer or platform.">
      {label}
    </Badge>
  );
}

const inputCls =
  "w-full min-w-0 rounded-md border border-line-strong bg-transparent px-3 py-2 text-[13px] max-sm:text-[16px] text-fg shadow-xs outline-none transition-[color,box-shadow,border-color] placeholder:text-faint focus-visible:border-faint focus-visible:ring-2 focus-visible:ring-fg/15 disabled:cursor-not-allowed disabled:opacity-50";
export function Input(p: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} className={cn(inputCls, "h-9 max-sm:h-10", p.className)} />;
}
export function Textarea(p: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...p} className={cn(inputCls, "min-h-20 resize-y leading-relaxed", p.className)} />;
}
export function Select({ options, ...p }: React.SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string }[] }) {
  return (
    <span className={cn("relative inline-flex w-full", p.className?.match(/\bw-\S+/)?.[0])}>
      <select {...p} className={cn(inputCls, "h-9 w-full cursor-pointer appearance-none py-0 pr-8", p.className)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden />
    </span>
  );
}

/** Small "i" with a short explanation. A popover (tap-friendly), not a hover-only tooltip. */
export function InfoTip({ children, label = "More information" }: { children: ReactNode; label?: string }) {
  return (
    <Popover.Root>
      <Popover.Trigger aria-label={label} className="inline-flex size-4 items-center justify-center rounded-full align-middle text-faint outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-fg/30">
        <Info className="size-3.5" aria-hidden />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content side="top" sideOffset={6} collisionPadding={12} className="z-[120] w-64 animate-fade-in rounded-lg border border-line-strong bg-panel-2 px-3 py-2 text-xs leading-relaxed text-fg shadow-xl outline-none">
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function Field({ label, hint, children, error, optional, info }: { label: string; hint?: ReactNode; error?: string | null; optional?: boolean; info?: ReactNode; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <label htmlFor={id} className="text-[13px] font-medium leading-none text-fg">
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
    <SwitchPrimitive.Root
      checked={checked}
      onCheckedChange={onChange}
      aria-label={label}
      disabled={disabled}
      className="peer inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent shadow-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-fg/30 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-fg data-[state=unchecked]:bg-panel-3"
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block size-4 rounded-full shadow-sm ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=checked]:bg-bg data-[state=unchecked]:translate-x-0.5 data-[state=unchecked]:bg-fg" />
    </SwitchPrimitive.Root>
  );
}

/** A row with a title, explanation and a control on the right (settings pattern). */
export function SettingRow({ title, description, children, optional, info }: { title: ReactNode; description?: ReactNode; children: ReactNode; optional?: boolean; info?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 max-w-xl">
        <p className="flex items-center gap-1.5 text-[13.5px] font-medium">
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
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(v) => v && onChange(v as T)}
      aria-label={label}
      className={cn("inline-flex rounded-lg border border-line-strong bg-panel-2 p-0.5", className)}
    >
      {options.map((o) => (
        <ToggleGroup.Item
          key={o.value}
          value={o.value}
          title={o.hint}
          className={cn(
            "flex-1 whitespace-nowrap rounded-md font-medium text-muted outline-none transition-colors hover:text-fg focus-visible:ring-2 focus-visible:ring-fg/30 data-[state=on]:bg-panel-3 data-[state=on]:text-fg data-[state=on]:shadow-sm",
            size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-[13px]",
          )}
        >
          {o.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}

export function Slider({ value, onChange, min = 0, max = 100, step = 1, label, left, right, id }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; label: string; left?: string; right?: string; id?: string }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <SliderPrimitive.Root id={id} value={[value]} min={min} max={max} step={step} onValueChange={([v]) => onChange(v)} aria-label={label} className="relative flex h-5 w-full touch-none select-none items-center">
        <SliderPrimitive.Track className="relative h-1.5 grow overflow-hidden rounded-full bg-panel-3">
          <SliderPrimitive.Range className="absolute h-full bg-fg" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb aria-label={label} aria-valuetext={left && right ? (pct < 34 ? left : pct > 66 ? right : "Balanced") : String(value)} className="block size-4 rounded-full border border-line-strong bg-fg shadow-md outline-none transition-shadow focus-visible:ring-4 focus-visible:ring-fg/20" />
      </SliderPrimitive.Root>
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
  return (
    <Collapsible.Root defaultOpen={defaultOpen} id={id} className="group rounded-xl border border-line bg-panel">
      <Collapsible.Trigger className="flex w-full items-center justify-between gap-3 rounded-xl px-5 py-4 text-left outline-none hover:bg-panel-2/60 focus-visible:ring-2 focus-visible:ring-fg/30 sm:px-6">
        <span>
          <span className="block text-[13.5px] font-medium">{title}</span>
          {description && <span className="mt-0.5 block text-xs text-faint">{description}</span>}
        </span>
        <ChevronDown className="size-4 shrink-0 text-faint transition-transform duration-200 group-data-[state=open]:rotate-180" aria-hidden />
      </Collapsible.Trigger>
      <Collapsible.Content className="animate-fade-in border-t border-line p-5 sm:p-6">{children}</Collapsible.Content>
    </Collapsible.Root>
  );
}

export function Avatar({ name, size = 36, className }: { name: string; size?: number; className?: string }) {
  const initials = name.replace(/\(.*?\)/g, "").trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
  return (
    <span aria-hidden className={cn("inline-flex shrink-0 items-center justify-center rounded-full border border-line-strong bg-panel-3 font-medium text-fg", className)} style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {initials}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-md", className)} aria-hidden />;
}

export function Empty({ title, children, action, icon }: { title: string; children?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong px-6 py-12 text-center">
      {icon && <div className="mb-1 rounded-lg border border-line-strong bg-panel-2 p-2.5 text-muted">{icon}</div>}
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
      <div className="mt-1.5 break-words rounded-md border border-line bg-bg px-2.5 py-2 font-mono text-[11px] leading-relaxed text-muted">{children}</div>
    </details>
  );
}

export function ErrorBox({ error, retry }: { error: string; retry?: () => void }) {
  const h = humanize(error);
  return (
    <div role="alert" className="rounded-xl border border-line-strong bg-panel px-4 py-3 text-[13px]">
      <div className="flex items-start justify-between gap-3">
        <p className="flex items-start gap-2 text-fg">
          <XCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden /> {h.message}
        </p>
        {retry && (
          <Button size="xs" variant="outline" onClick={retry}>
            Try again
          </Button>
        )}
      </div>
      {h.technical !== h.message && <TechDetails>{h.technical}</TechDetails>}
    </div>
  );
}

/** Callout. Neutral surface; only the icon carries colour. */
export function Notice({ tone = "info", children, title, action }: { tone?: "info" | "warn" | "danger" | "ok"; children: ReactNode; title?: ReactNode; action?: ReactNode }) {
  const Icon = { info: Info, warn: AlertTriangle, danger: XCircle, ok: CheckCircle2 }[tone];
  const ic = { info: "text-muted", warn: "text-warn", danger: "text-danger", ok: "text-ok" }[tone];
  return (
    <div className={cn("flex gap-3 rounded-xl border bg-panel px-4 py-3 text-[13px] leading-relaxed", tone === "danger" ? "border-danger/30" : "border-line-strong")}>
      <Icon className={cn("mt-0.5 size-4 shrink-0", ic)} aria-hidden />
      <div className="min-w-0 flex-1 text-fg/90">
        {title && <p className="font-medium text-fg">{title}</p>}
        <div className={title ? "text-muted" : undefined}>{children}</div>
        {action && <div className="mt-2.5">{action}</div>}
      </div>
    </div>
  );
}

export function Stat({ label, value, hint, tone, icon }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "ok" | "warn" | "danger"; icon?: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-panel px-4 py-3.5">
      <p className="flex items-center gap-1.5 text-xs text-muted">
        {icon}
        {label}
      </p>
      <p className={cn("mt-1.5 text-[26px] font-semibold leading-none tracking-[-0.02em] tabular-nums", tone === "danger" && "text-danger")}>{value}</p>
      {hint && <p className="mt-1.5 text-xs text-faint">{hint}</p>}
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string }[]; value: T; onChange: (t: T) => void }) {
  return (
    <TabsPrimitive.Root value={value} onValueChange={(v) => onChange(v as T)}>
      <TabsPrimitive.List className="-mx-1 flex gap-1 overflow-x-auto border-b border-line px-1">
        {tabs.map((t) => (
          <TabsPrimitive.Trigger
            key={t.id}
            value={t.id}
            className="-mb-px whitespace-nowrap border-b-2 border-transparent px-3 py-2.5 text-[13px] font-medium text-muted outline-none transition-colors hover:text-fg focus-visible:text-fg data-[state=active]:border-fg data-[state=active]:text-fg"
          >
            {t.label}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
    </TabsPrimitive.Root>
  );
}

/** Modal dialog (Radix): focus is trapped while open and returned on close; Esc and the overlay close it. Bottom sheet on phones. */
export function Dialog({ open, onClose, title, children, footer, description }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; description?: ReactNode }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[100] animate-fade-in bg-black/70 backdrop-blur-[2px]" />
        <DialogPrimitive.Content
          aria-describedby={description ? undefined : undefined}
          className="fixed inset-x-0 bottom-0 z-[101] max-h-[92dvh] w-full animate-rise overflow-y-auto rounded-t-2xl border border-line-strong bg-panel pb-[env(safe-area-inset-bottom)] shadow-2xl outline-none sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:animate-pop sm:rounded-xl"
        >
          <div className="flex items-start justify-between gap-3 px-5 pt-5 sm:px-6">
            <div>
              <DialogPrimitive.Title className="text-[16px] font-semibold tracking-[-0.01em]">{title}</DialogPrimitive.Title>
              {description ? <DialogPrimitive.Description className="mt-1.5 text-[13px] leading-relaxed text-muted">{description}</DialogPrimitive.Description> : <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>}
            </div>
            <DialogPrimitive.Close asChild>
              <Button size="icon-sm" variant="ghost" aria-label="Close">
                <X className="size-4" />
              </Button>
            </DialogPrimitive.Close>
          </div>
          <div className="space-y-3 px-5 py-4 sm:px-6">{children}</div>
          {footer && <div className="flex flex-col-reverse gap-2 border-t border-line px-5 py-4 sm:flex-row sm:justify-end sm:px-6">{footer}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Dropdown menu (Radix): keyboard and screen-reader friendly. */
export const Menu = {
  Root: DM.Root,
  Trigger: DM.Trigger,
  Content: ({ children, align = "end", className }: { children: ReactNode; align?: "start" | "end" | "center"; className?: string }) => (
    <DM.Portal>
      <DM.Content align={align} sideOffset={6} collisionPadding={12} className={cn("z-[110] min-w-56 animate-fade-in rounded-lg border border-line-strong bg-panel-2 p-1 shadow-xl outline-none", className)}>
        {children}
      </DM.Content>
    </DM.Portal>
  ),
  Item: ({ children, onSelect, disabled, className }: { children: ReactNode; onSelect?: () => void; disabled?: boolean; className?: string }) => (
    <DM.Item onSelect={onSelect} disabled={disabled} className={cn("flex cursor-default items-start gap-2 rounded-md px-2.5 py-2 text-[13px] outline-none data-[disabled]:opacity-40 data-[highlighted]:bg-panel-3", className)}>
      {children}
    </DM.Item>
  ),
  Label: ({ children }: { children: ReactNode }) => <DM.Label className="px-2.5 pb-1 pt-1.5 text-[11px] font-medium text-faint">{children}</DM.Label>,
  Separator: () => <DM.Separator className="my-1 h-px bg-line" />,
};

export { Popover };

type ToastFn = (text: string, tone?: "ok" | "danger" | "info", technical?: string) => void;
const push: ToastFn = (text, tone = "ok", technical) => {
  const opts = technical && technical !== text ? { description: technical } : undefined;
  if (tone === "danger") toast.error(text, opts);
  else if (tone === "info") toast(text, opts);
  else toast.success(text, opts);
};
export const useToast = () => push;
export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <Toaster
        theme="dark"
        position="bottom-center"
        offset={{ bottom: 88 }}
        mobileOffset={{ bottom: 84 }}
        toastOptions={{ classNames: { toast: "!bg-panel-2 !border-line-strong !text-fg !rounded-xl !shadow-2xl", description: "!text-faint !font-mono !text-[11px]" } }}
      />
    </>
  );
}

/** Run an async action with loading + toast feedback. Errors are shown in plain language. */
export function useAction() {
  const toastFn = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const run = useCallback(
    async <T,>(key: string, fn: () => Promise<T>, okText?: string | ((r: T) => string)): Promise<T | undefined> => {
      setBusy(key);
      try {
        const r = await fn();
        if (okText) toastFn(typeof okText === "function" ? okText(r) : okText);
        return r;
      } catch (e) {
        const h = humanize(e instanceof Error ? e.message : String(e));
        toastFn(h.message, "danger", h.technical);
      } finally {
        setBusy(null);
      }
    },
    [toastFn],
  );
  return { busy, run };
}

export function PageHeader({ title, description, actions, eyebrow }: { title: string; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow && <p className="mb-1 text-xs font-medium text-muted">{eyebrow}</p>}
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
        <thead className="border-b border-line text-xs text-faint">
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
