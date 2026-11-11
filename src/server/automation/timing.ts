import type { Rules } from "./settings";

/**
 * Pacing rules for automatic replies. Random delays exist for workload pacing and to keep
 * reply timing within the creator's configured habits. They are not a detection-evasion tool,
 * and the disclosure policy applies regardless of timing.
 */

export type Rng = () => number;

export function sampleDelaySec(p: Rules["firstReply"], rng: Rng = Math.random): number {
  const { minSec: a, maxSec: b } = p;
  if (b <= a) return a;
  let u: number;
  switch (p.distribution) {
    case "uniform":
      u = rng();
      break;
    case "triangular": {
      // mode at 1/3 of the range: most replies near the faster end
      const c = 1 / 3;
      const r = rng();
      u = r < c ? Math.sqrt(r * c) : 1 - Math.sqrt((1 - r) * (1 - c));
      break;
    }
    case "lognormal": {
      // Box-Muller normal, mapped through exp and squashed to [0,1]; long right tail
      const z = Math.sqrt(-2 * Math.log(Math.max(rng(), 1e-12))) * Math.cos(2 * Math.PI * rng());
      const x = Math.exp(0.6 * z - 0.5);
      u = Math.min(1, x / 3);
      break;
    }
  }
  return Math.round(a + (b - a) * u);
}

/** Debounce a burst of inbound messages: wait for a quiet gap, but never longer than maxWait from the first message. */
export function debounceRunAt(firstEventAt: Date, lastEventAt: Date, d: Rules["debounce"]): Date {
  const quiet = lastEventAt.getTime() + d.quietSec * 1000;
  const cap = firstEventAt.getTime() + d.maxWaitSec * 1000;
  return new Date(Math.min(quiet, cap));
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function localParts(t: Date, tz: string) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", weekday: "short", hour: "2-digit", minute: "2-digit" });
    fmtCache.set(tz, f);
  }
  const parts = Object.fromEntries(f.formatToParts(t).map((p) => [p.type, p.value]));
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  return { day, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
/** Window [start, end) in local minutes; supports windows that cross midnight. */
function inWindow(m: number, start: string, end: string) {
  const s = toMin(start), e = toMin(end);
  if (s === e) return true;
  return s < e ? m >= s && m < e : m >= s || m < e;
}

export function isSendableTime(t: Date, rules: Pick<Rules, "activeHours" | "quietHours">): { ok: boolean; why?: string } {
  const { activeHours: ah, quietHours: qh } = rules;
  const { day, minutes } = localParts(t, ah.timezone);
  if (ah.enabled) {
    // For windows crossing midnight, the early-morning part belongs to the previous local day.
    const s = toMin(ah.start), e = toMin(ah.end);
    const effectiveDay = s > e && minutes < e ? (day + 6) % 7 : day;
    if (!ah.days.includes(effectiveDay)) return { ok: false, why: "outside active days" };
    if (!inWindow(minutes, ah.start, ah.end)) return { ok: false, why: "outside active hours" };
  }
  if (qh.enabled && inWindow(minutes, qh.start, qh.end)) return { ok: false, why: "inside quiet hours" };
  return { ok: true };
}

/**
 * First instant ≥ t at which an automatic send is allowed. Computed from real instants via Intl,
 * so daylight-saving transitions are handled (a skipped local hour simply never matches).
 */
export function nextSendableTime(t: Date, rules: Pick<Rules, "activeHours" | "quietHours">): Date | null {
  if (isSendableTime(t, rules).ok) return t;
  // Step to the next whole minute, then scan in 1-minute increments for up to 8 days.
  let cur = new Date(Math.ceil(t.getTime() / 60000) * 60000);
  for (let i = 0; i < 8 * 1440; i++) {
    if (isSendableTime(cur, rules).ok) return cur;
    cur = new Date(cur.getTime() + 60000);
  }
  return null; // misconfigured: no sendable time in the next 8 days
}

export type ScheduleInput = {
  inboundAt: Date[];
  isFirstReply: boolean;
  rules: Rules;
  rng?: Rng;
  sentLastHour?: number;
  sentLastDay?: number;
};
export type ScheduleResult =
  | { ok: true; generateAt: Date; sendAt: Date; delaySec: number; steps: string[] }
  | { ok: false; reason: string; steps: string[] };

/** Full scheduling decision; used by the worker and the Automation page preview. */
export function planReply(input: ScheduleInput): ScheduleResult {
  const { rules } = input;
  const steps: string[] = [];
  if (input.inboundAt.length === 0) return { ok: false, reason: "No inbound messages", steps };
  const sorted = [...input.inboundAt].sort((a, b) => a.getTime() - b.getTime());
  const first = sorted[0], last = sorted[sorted.length - 1];
  const generateAt = debounceRunAt(first, last, rules.debounce);
  steps.push(
    `${sorted.length} message(s) batched; draft generated at ${fmt(generateAt)} (quiet ${rules.debounce.quietSec}s, max wait ${rules.debounce.maxWaitSec}s)`,
  );
  if ((input.sentLastHour ?? 0) >= rules.caps.perChatPerHour) return { ok: false, reason: `Hourly cap reached (${rules.caps.perChatPerHour}/chat)`, steps };
  if ((input.sentLastDay ?? 0) >= rules.caps.perChatPerDay) return { ok: false, reason: `Daily cap reached (${rules.caps.perChatPerDay}/chat)`, steps };
  const preset = input.isFirstReply ? rules.firstReply : rules.ongoing;
  const delaySec = sampleDelaySec(preset, input.rng);
  const raw = new Date(generateAt.getTime() + delaySec * 1000);
  steps.push(`${input.isFirstReply ? "First-reply" : "Ongoing"} delay ${delaySec}s (${preset.distribution}, ${preset.minSec}–${preset.maxSec}s) → ${fmt(raw)}`);
  const sendAt = nextSendableTime(raw, rules);
  if (!sendAt) return { ok: false, reason: "No sendable time in the next 8 days; check active/quiet hours", steps };
  if (sendAt.getTime() !== raw.getTime()) steps.push(`${isSendableTime(raw, rules).why}; deferred to ${fmt(sendAt)} (${rules.activeHours.timezone})`);
  return { ok: true, generateAt, sendAt, delaySec, steps };
}

function fmt(d: Date) {
  return d.toISOString().replace("T", " ").slice(0, 19) + "Z";
}
