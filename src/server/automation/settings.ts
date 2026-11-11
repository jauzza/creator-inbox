import { z } from "zod";
import { db, type Tx } from "../db";

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24h)");

export const delayPreset = z
  .object({
    minSec: z.number().int().min(0).max(86400),
    maxSec: z.number().int().min(0).max(86400),
    distribution: z.enum(["uniform", "triangular", "lognormal"]),
  })
  .refine((p) => p.maxSec >= p.minSec, { message: "Maximum delay must be ≥ minimum delay" });

export const rulesSchema = z.object({
  firstReply: delayPreset,
  ongoing: delayPreset,
  debounce: z
    .object({ quietSec: z.number().int().min(0).max(3600), maxWaitSec: z.number().int().min(0).max(7200) })
    .refine((d) => d.maxWaitSec >= d.quietSec, { message: "Max wait must be ≥ quiet period" }),
  activeHours: z.object({
    enabled: z.boolean(),
    timezone: z.string().refine(isValidTz, "Unknown IANA timezone"),
    days: z.array(z.number().int().min(0).max(6)).min(1, "Pick at least one day"),
    start: hhmm,
    end: hhmm,
  }),
  quietHours: z.object({ enabled: z.boolean(), start: hhmm, end: hhmm }),
  caps: z.object({ perChatPerHour: z.number().int().min(1).max(100), perChatPerDay: z.number().int().min(1).max(500) }),
  queue: z.object({
    concurrency: z.number().int().min(1).max(16),
    accountMinIntervalSec: z.number().int().min(0).max(600),
    cooldownAfterSendSec: z.number().int().min(0).max(3600),
  }),
  maxDraftAgeMin: z.number().int().min(1).max(1440),
  exclusions: z.object({ tags: z.array(z.string().max(40)).max(50), customerIds: z.array(z.string()).max(1000) }),
  handoff: z.object({
    intentThreshold: z.number().min(1).max(100),
    pauseOnHandoff: z.boolean(),
    takeoverExpiryMin: z.number().int().min(0).max(10080), // 0 = never: only explicit resume
  }),
  scoring: z.object({
    halfLifeHours: z.number().min(1).max(24 * 60),
    weights: z.object({
      priceQuestion: z.number().min(0).max(50),
      catalogQuestion: z.number().min(0).max(50),
      purchaseInterest: z.number().min(0).max(50),
      priorPurchase: z.number().min(0).max(50),
      recentEngagement: z.number().min(0).max(20),
      declineSignal: z.number().min(0).max(50),
    }),
  }),
  disclosure: z.object({
    mode: z.enum(["first_ai_message", "every_ai_message"]),
    /** Provider-required tag for AI-written content (Fans API compliance docs require "#ai"). */
    tag: z.string().max(20),
  }),
  ai: z.object({ maxRewrites: z.number().int().min(0).max(1), contextMessages: z.number().int().min(2).max(40) }),
  offers: z.object({ declineCooldownDays: z.number().int().min(0).max(365) }),
  notifications: z.object({ cooldownMin: z.number().int().min(0).max(1440), telegramIncludeBodies: z.boolean() }),
});

export type Rules = z.infer<typeof rulesSchema>;

export function isValidTz(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const DEFAULT_RULES: Rules = {
  firstReply: { minSec: 90, maxSec: 420, distribution: "lognormal" },
  ongoing: { minSec: 30, maxSec: 180, distribution: "triangular" },
  debounce: { quietSec: 45, maxWaitSec: 240 },
  activeHours: { enabled: true, timezone: "Europe/Amsterdam", days: [0, 1, 2, 3, 4, 5, 6], start: "10:00", end: "23:30" },
  quietHours: { enabled: false, start: "02:00", end: "08:00" },
  caps: { perChatPerHour: 8, perChatPerDay: 40 },
  queue: { concurrency: 4, accountMinIntervalSec: 3, cooldownAfterSendSec: 15 },
  maxDraftAgeMin: 30,
  exclusions: { tags: ["manual-only"], customerIds: [] },
  handoff: { intentThreshold: 70, pauseOnHandoff: true, takeoverExpiryMin: 0 },
  scoring: {
    halfLifeHours: 72,
    weights: { priceQuestion: 18, catalogQuestion: 12, purchaseInterest: 22, priorPurchase: 10, recentEngagement: 3, declineSignal: 30 },
  },
  disclosure: { mode: "first_ai_message", tag: "#ai" },
  ai: { maxRewrites: 1, contextMessages: 12 },
  offers: { declineCooldownDays: 14 },
  notifications: { cooldownMin: 10, telegramIncludeBodies: false },
};

/** Pass `tx` when inside a transaction (never mix the global client into an open transaction). */
export async function getAutomation(client: Tx = db()) {
  const row = await client.automationSettings.upsert({
    where: { id: "global" },
    create: { id: "global", globalMode: "DRAFT", rules: DEFAULT_RULES },
    update: {},
  });
  const parsed = rulesSchema.safeParse({ ...DEFAULT_RULES, ...(row.rules as object) });
  return { ...row, rules: parsed.success ? parsed.data : DEFAULT_RULES };
}
