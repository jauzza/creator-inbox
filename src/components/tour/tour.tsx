"use client";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Loader2, MousePointerClick, OctagonX, X } from "lucide-react";
import { Button, cn, useToast } from "../ui";
import { humanize } from "@/lib/client";
import { STEPS, CHAPTERS, type TourStep, type TourData } from "./steps";

/**
 * Interactive spotlight walkthrough.
 * - Dims and blurs everything except the highlighted element, which stays sharp and clickable.
 * - One explanation at a time, positioned next to the element (bottom sheet on small screens).
 * - Progress is remembered in localStorage (UI state only, no secrets) and can be resumed or restarted.
 * - Never traps: Esc exits, focus is not locked, and the emergency stop stays reachable above the overlay.
 */

const KEY = "ci.tour.v1";
type Saved = { stepId: string | null; finished: boolean; completed: string[]; data: TourData; running?: boolean };
const EMPTY: Saved = { stepId: null, finished: false, completed: [], data: {}, running: false };

function load(): Saved {
  if (typeof window === "undefined") return EMPTY;
  try {
    return { ...EMPTY, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return EMPTY;
  }
}

type Ctx = {
  active: boolean;
  step: TourStep | null;
  index: number;
  saved: Saved;
  data: TourData;
  busy: boolean;
  start: (opts?: { restart?: boolean }) => void;
  exit: () => void;
  signal: (event: string) => void;
  setData: (patch: Partial<TourData>) => void;
};
const TourCtx = createContext<Ctx>({ active: false, step: null, index: 0, saved: EMPTY, data: {}, busy: false, start: () => {}, exit: () => {}, signal: () => {}, setData: () => {} });
export const useTour = () => useContext(TourCtx);

export function TourProvider({ children, onEmergency, stopOn }: { children: ReactNode; onEmergency: () => void; stopOn: boolean }) {
  const [saved, setSaved] = useState<Saved>(EMPTY);
  const [active, setActive] = useState(false);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [doneFlash, setDoneFlash] = useState(false);
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const toast = useToast();
  const savedRef = useRef(saved);
  savedRef.current = saved;

  // Resume automatically after a reload or navigation if the tour was running (not if the user exited).
  useEffect(() => {
    const s = load();
    setSaved(s);
    if (s.running && !s.finished && s.stepId) {
      const i = STEPS.findIndex((x) => x.id === s.stepId);
      if (i >= 0) {
        setIndex(i);
        setActive(true);
      }
    }
  }, []);
  const persist = useCallback((next: Saved) => {
    savedRef.current = next; // keep sequential updates (complete → go) from overwriting each other
    setSaved(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {}
  }, []);

  const step = active ? STEPS[index] : null;
  const data = saved.data;

  const setData = useCallback((patch: Partial<TourData>) => persist({ ...savedRef.current, data: { ...savedRef.current.data, ...patch } }), [persist]);

  const go = useCallback(
    (i: number) => {
      const clamped = Math.max(0, Math.min(STEPS.length - 1, i));
      setIndex(clamped);
      persist({ ...savedRef.current, stepId: STEPS[clamped].id });
    },
    [persist],
  );

  const complete = useCallback(
    (id: string) => {
      const s = savedRef.current;
      if (!s.completed.includes(id)) persist({ ...s, completed: [...s.completed, id] });
    },
    [persist],
  );

  const next = useCallback(() => {
    if (!step) return;
    complete(step.id);
    if (index >= STEPS.length - 1) {
      persist({ ...savedRef.current, finished: true, stepId: null, running: false });
      setActive(false);
      return;
    }
    go(index + 1);
  }, [step, index, go, complete, persist]);

  const back = useCallback(() => go(index - 1), [go, index]);

  const start = useCallback(
    ({ restart }: { restart?: boolean } = {}) => {
      const s = savedRef.current;
      const resumeAt = !restart && s.stepId ? STEPS.findIndex((x) => x.id === s.stepId) : -1;
      if (restart) persist({ ...EMPTY, completed: [], data: {}, running: true, stepId: STEPS[0].id });
      else persist({ ...s, running: true, finished: false });
      localStorage.setItem("ci.welcome.done", "1");
      setIndex(resumeAt >= 0 ? resumeAt : 0);
      setActive(true);
    },
    [persist],
  );

  const exit = useCallback(() => {
    persist({ ...savedRef.current, running: false });
    setActive(false);
    toast("Tour paused. Resume it any time from “Guided tour”.", "info");
  }, [toast, persist]);

  // Task completion: either a signal from the UI or a route condition.
  const signal = useCallback(
    (event: string) => {
      if (!step?.task || step.task.event !== event) return;
      setDoneFlash(true);
      setTimeout(() => {
        setDoneFlash(false);
        next();
      }, 650);
    },
    [step, next],
  );
  // Route tasks complete only on a navigation made during the step, so Back never bounces forward again.
  const entryPath = useRef<{ id: string; full: string } | null>(null);
  useEffect(() => {
    if (!step?.task?.path) return;
    const full = `${path}?${sp.toString()}`;
    if (entryPath.current?.id !== step.id) {
      entryPath.current = { id: step.id, full };
      return;
    }
    if (full !== entryPath.current.full && step.task.path(full, data)) signal(step.task.event);
  }, [path, sp, step, data, signal]);

  // Entering a step: make sure prerequisites exist (so skipping never strands the user), then navigate.
  useEffect(() => {
    if (!step) return;
    let cancelled = false;
    (async () => {
      if (step.ensure) {
        setBusy(true);
        try {
          const patch = await step.ensure(savedRef.current.data);
          if (patch && !cancelled) setData(patch);
        } catch (e) {
          toast(humanize(e instanceof Error ? e.message : String(e)).message, "danger");
        } finally {
          if (!cancelled) setBusy(false);
        }
      }
      const route = typeof step.route === "function" ? step.route(savedRef.current.data) : step.route;
      if (route && !cancelled) {
        const here = `${location.pathname}${location.search}`;
        const targetPath = route.split("?")[0];
        if (route !== here && !(step.routeLoose && location.pathname === targetPath)) router.push(route, { scroll: false });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step?.id]);

  const runPrimary = useCallback(async () => {
    if (!step?.primary) return next();
    setBusy(true);
    try {
      const patch = await step.primary.run(savedRef.current.data);
      if (patch) setData(patch);
      next();
    } catch (e) {
      const h = humanize(e instanceof Error ? e.message : String(e));
      toast(h.message, "danger", h.technical);
    } finally {
      setBusy(false);
    }
  }, [step, next, setData, toast]);

  const value = useMemo<Ctx>(() => ({ active, step, index, saved, data, busy, start, exit, signal, setData }), [active, step, index, saved, data, busy, start, exit, signal, setData]);

  return (
    <TourCtx.Provider value={value}>
      {children}
      {active && step && (
        <Overlay
          key="overlay"
          step={step}
          index={index}
          data={data}
          busy={busy}
          done={doneFlash}
          onNext={step.primary ? runPrimary : next}
          onSkipStep={next}
          onBack={back}
          onExit={exit}
          onSkipTour={() => {
            persist({ ...savedRef.current, finished: true, stepId: null, running: false });
            setActive(false);
            toast("Tour skipped. You can restart it from “Guided tour” any time.", "info");
          }}
          onEmergency={onEmergency}
          stopOn={stopOn}
        />
      )}
    </TourCtx.Provider>
  );
}

type Rect = { top: number; left: number; width: number; height: number };
const PAD = 8;

function findTarget(name: string): HTMLElement | null {
  const all = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`));
  return all.find((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
  }) ?? null;
}

function Overlay({ step, index, data, busy, done, onNext, onSkipStep, onBack, onExit, onSkipTour, onEmergency, stopOn }: { step: TourStep; index: number; data: TourData; busy: boolean; done: boolean; onNext: () => void; onSkipStep: () => void; onBack: () => void; onExit: () => void; onSkipTour: () => void; onEmergency: () => void; stopOn: boolean }) {
  const [rect, setRect] = useState<Rect | null>(null);
  const [missing, setMissing] = useState(false);
  const [vp, setVp] = useState({ w: 1200, h: 800 });
  const popRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const scrolledFor = useRef<string | null>(null);

  // Track the target every frame (handles scrolling, layout shifts and route changes).
  useLayoutEffect(() => {
    setRect(null);
    setMissing(false);
    if (!step.target) return;
    let raf = 0;
    const startedAt = performance.now();
    let last = "";
    const measure = () => {
      const el = findTarget(step.target!);
      if (el) {
        if (scrolledFor.current !== step.id) {
          scrolledFor.current = step.id;
          el.scrollIntoView({ block: el.getBoundingClientRect().height > window.innerHeight * 0.6 ? "start" : "center", inline: "nearest", behavior: "smooth" });
        }
        const r = el.getBoundingClientRect();
        const key = `${Math.round(r.top)}:${Math.round(r.left)}:${Math.round(r.width)}:${Math.round(r.height)}`;
        if (key !== last) {
          last = key;
          setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
          setMissing(false);
        }
      } else if (performance.now() - startedAt > 6000) {
        setMissing(true);
      }
    };
    const tick = () => {
      measure();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    // Fallback for throttled or background tabs where animation frames pause.
    const iv = window.setInterval(measure, 150);
    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(iv);
    };
  }, [step.id, step.target]);

  useEffect(() => {
    const on = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    on();
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);

  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
  }, [step.id]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (e.key === "Escape") return onExit();
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "ArrowRight" && !busy) onSkipStep();
      if (e.key === "ArrowLeft" && index > 0) onBack();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onExit, onSkipStep, onBack, index, busy]);

  const mobile = vp.w < 640;
  const hole = rect && !missing ? { top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 } : null;
  const centered = !step.target || missing || !hole;
  const interactive = !!step.task || step.interactive;

  // Popover placement next to the hole, flipped/clamped to stay on screen.
  const popW = Math.min(380, vp.w - 24);
  const [popH, setPopH] = useState(260);
  useLayoutEffect(() => {
    if (popRef.current) setPopH(popRef.current.offsetHeight);
  });
  let pos: React.CSSProperties = {};
  if (mobile) {
    const holeLow = hole && hole.top + hole.height / 2 > vp.h / 2;
    pos = holeLow ? { left: 12, right: 12, top: 12 } : { left: 12, right: 12, bottom: 12 };
  } else if (centered) {
    pos = { left: (vp.w - popW) / 2, top: Math.max(24, (vp.h - popH) / 2) };
  } else if (hole) {
    const gap = 14;
    const space = { right: vp.w - (hole.left + hole.width), left: hole.left, bottom: vp.h - (hole.top + hole.height), top: hole.top };
    const order = [step.placement ?? "right", "right", "bottom", "left", "top"] as const;
    const fits = (p: string) => (p === "right" || p === "left" ? space[p as "right"] > popW + gap + 12 : space[p as "top"] > popH + gap + 12);
    const p = order.find(fits) ?? "center";
    const clampX = (x: number) => Math.max(12, Math.min(vp.w - popW - 12, x));
    const clampY = (y: number) => Math.max(12, Math.min(vp.h - popH - 12, y));
    if (p === "right") pos = { left: hole.left + hole.width + gap, top: clampY(hole.top + hole.height / 2 - popH / 2) };
    else if (p === "left") pos = { left: hole.left - popW - gap, top: clampY(hole.top + hole.height / 2 - popH / 2) };
    else if (p === "bottom") pos = { left: clampX(hole.left + hole.width / 2 - popW / 2), top: hole.top + hole.height + gap };
    else if (p === "top") pos = { left: clampX(hole.left + hole.width / 2 - popW / 2), top: hole.top - popH - gap };
    else pos = { left: (vp.w - popW) / 2, top: Math.max(24, (vp.h - popH) / 2) };
  }

  const chapter = CHAPTERS.find((c) => c.id === step.chapter);
  const chIndex = CHAPTERS.findIndex((c) => c.id === step.chapter);
  const stepsInChapter = STEPS.filter((s) => s.chapter === step.chapter);
  const posInChapter = stepsInChapter.findIndex((s) => s.id === step.id);
  const body = typeof step.body === "function" ? step.body(data) : step.body;
  const dim = "pointer-events-auto bg-[rgb(4_4_8/0.62)] backdrop-blur-[3px] transition-all duration-300 ease-out";
  const block = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div className="pointer-events-none fixed inset-0 z-[80]">
      {/* Dim + blur everything except the hole. Four panels keep the highlighted element sharp and clickable. */}
      {hole && !centered ? (
        <>
          <div className={cn("fixed left-0 right-0 top-0", dim)} style={{ height: Math.max(0, hole.top) }} onClick={block} />
          <div className={cn("fixed left-0 right-0", dim)} style={{ top: hole.top + hole.height, bottom: 0 }} onClick={block} />
          <div className={cn("fixed left-0", dim)} style={{ top: hole.top, height: hole.height, width: Math.max(0, hole.left) }} onClick={block} />
          <div className={cn("fixed right-0", dim)} style={{ top: hole.top, height: hole.height, left: hole.left + hole.width }} onClick={block} />
          <div aria-hidden className={cn("pointer-events-none fixed rounded-xl ring-2 ring-accent transition-all duration-300 ease-out", interactive && "animate-pulse-ring")} style={{ ...hole, boxShadow: "0 0 0 1px rgb(255 255 255 / 0.06), 0 0 40px 4px color-mix(in oklab, var(--color-accent) 22%, transparent)" }} />
          {!interactive && <div className="pointer-events-auto fixed" style={hole} onClick={block} title="This step is just for looking. Use Next to continue." />}
        </>
      ) : (
        <div className={cn("fixed inset-0", dim)} onClick={block} />
      )}

      {/* The emergency stop is never blocked by the tour. */}
      <div className="pointer-events-auto fixed right-3 top-3 z-[95] lg:right-5 lg:top-4">
        <button type="button" onClick={onEmergency} className={cn("flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium shadow-xl backdrop-blur", stopOn ? "border-line-strong bg-panel-3/90 text-fg" : "border-danger/40 bg-[#2a1416]/90 text-danger hover:bg-[#3a1a1c]")}>
          <OctagonX className="size-3.5" aria-hidden />
          {stopOn ? "Sending stopped · release" : "Stop all sends"}
        </button>
      </div>

      <div
        ref={popRef}
        role="dialog"
        aria-modal="false"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        key={step.id}
        className="pointer-events-auto fixed z-[90] animate-pop rounded-2xl border border-line-strong bg-panel/98 shadow-[0_24px_80px_-12px_rgb(0_0_0/0.8)] backdrop-blur-xl sm:transition-[top,left] sm:duration-300 sm:ease-out"
        style={{ ...pos, width: mobile ? undefined : popW }}
      >
        <div className="flex items-center justify-between gap-3 px-5 pt-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-accent">
            {chapter?.label}
            <span className="ml-2 normal-case tracking-normal text-faint">
              {posInChapter + 1} of {stepsInChapter.length}
            </span>
          </p>
          <button type="button" onClick={onExit} aria-label="Exit tour (Esc)" title="Exit tour (Esc). Your progress is saved." className="rounded-md p-1 text-faint hover:bg-panel-2 hover:text-fg">
            <X className="size-4" />
          </button>
        </div>
        {/* Chapter progress */}
        <div className="mt-2.5 flex gap-1 px-5" aria-label={`Chapter ${chIndex + 1} of ${CHAPTERS.length}`}>
          {CHAPTERS.map((c, i) => (
            <span key={c.id} className="h-1 flex-1 overflow-hidden rounded-full bg-panel-3">
              <span className="block h-full rounded-full bg-accent transition-all duration-500" style={{ width: i < chIndex ? "100%" : i === chIndex ? `${((posInChapter + 1) / stepsInChapter.length) * 100}%` : "0%" }} />
            </span>
          ))}
        </div>
        <div className="px-5 pb-4 pt-3.5">
          <h2 id="tour-title" ref={titleRef} tabIndex={-1} className="text-[16px] font-semibold leading-snug tracking-[-0.01em] outline-none">
            {step.title}
          </h2>
          <div id="tour-body" className="mt-1.5 space-y-2 text-[13.5px] leading-relaxed text-muted [&_b]:font-medium [&_b]:text-fg">
            {body}
          </div>
          {step.task && (
            <div className={cn("mt-3 flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-[13px] transition-colors", done ? "border-ok/40 bg-ok/10 text-ok" : "border-accent/30 bg-accent/8 text-fg")}>
              {done ? <Check className="size-4 shrink-0" aria-hidden /> : <MousePointerClick className="size-4 shrink-0 text-accent" aria-hidden />}
              <span>{done ? "Nice, that's it!" : <><span className="font-medium">Your turn:</span> {step.task.label}</>}</span>
            </div>
          )}
          {missing && step.target && <p className="mt-2 text-xs text-faint">We couldn't find this part of the screen right now, so here's the explanation on its own.</p>}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-3">
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={onBack} disabled={index === 0 || busy} aria-label="Previous step">
              <ArrowLeft className="size-3.5" /> Back
            </Button>
            {index < STEPS.length - 1 && (
              <Button size="sm" variant="ghost" onClick={onSkipTour} className="text-faint">
                Skip tour
              </Button>
            )}
          </div>
          {step.primary ? (
            <div className="flex items-center gap-1">
              {step.task === undefined && step.primary.optional && (
                <Button size="sm" variant="ghost" onClick={onSkipStep} disabled={busy}>
                  Skip
                </Button>
              )}
              <Button size="sm" variant="primary" onClick={onNext} loading={busy} data-autofocus>
                {busy ? step.primary.busyLabel ?? "Working…" : step.primary.label}
                {!busy && <ArrowRight className="size-3.5" />}
              </Button>
            </div>
          ) : (
            <Button size="sm" variant={step.task ? "secondary" : "primary"} onClick={onSkipStep} disabled={busy}>
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
              {step.task ? "Skip this step" : index === STEPS.length - 1 ? "Finish" : "Next"}
              {!step.task && <ArrowRight className="size-3.5" />}
            </Button>
          )}
        </div>
      </div>
      <p className="sr-only" aria-live="polite">
        {`Tour step: ${step.title}`}
      </p>
    </div>
  );
}
