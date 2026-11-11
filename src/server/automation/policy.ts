import type { AutomationMode } from "@/generated/prisma/client";

/** Higher = more restrictive. The most restrictive applicable mode always wins. */
export const RESTRICTIVENESS: Record<AutomationMode, number> = { AUTO: 0, DRAFT: 1, MANUAL: 2, PAUSED: 3 };

export type PolicyInput = {
  globalMode: AutomationMode;
  emergencyStop: boolean;
  accountMode?: AutomationMode | null;
  conversationMode?: AutomationMode | null;
  takenOver?: boolean;
  takeoverExpiresAt?: Date | null;
  excluded?: boolean;
  doNotContact?: boolean;
  accountConnected?: boolean;
  now?: Date;
};

export type PolicyResult = {
  mode: AutomationMode;
  /** True if the AI may create drafts at all. */
  aiMayDraft: boolean;
  /** True if an AI draft may be sent without a human approval. */
  aiMayAutoSend: boolean;
  /** True if any send (including human-approved) may be attempted right now. */
  sendsAllowed: boolean;
  reasons: string[];
};

export function effectiveMode(p: PolicyInput): PolicyResult {
  const now = p.now ?? new Date();
  const candidates: { mode: AutomationMode; reason: string }[] = [{ mode: p.globalMode, reason: `Global mode is ${label(p.globalMode)}` }];
  if (p.accountMode) candidates.push({ mode: p.accountMode, reason: `Account override is ${label(p.accountMode)}` });
  if (p.conversationMode) candidates.push({ mode: p.conversationMode, reason: `Conversation override is ${label(p.conversationMode)}` });
  const takeoverActive = !!p.takenOver && (!p.takeoverExpiresAt || p.takeoverExpiresAt > now);
  if (takeoverActive) candidates.push({ mode: "MANUAL", reason: "An operator has taken over this conversation" });
  if (p.excluded) candidates.push({ mode: "MANUAL", reason: "Customer is excluded from automation" });
  if (p.doNotContact) candidates.push({ mode: "PAUSED", reason: "Customer asked not to be contacted" });
  if (p.emergencyStop) candidates.push({ mode: "PAUSED", reason: "Global emergency stop is on" });
  if (p.accountConnected === false) candidates.push({ mode: "PAUSED", reason: "Messaging account is not connected" });

  const max = Math.max(...candidates.map((c) => RESTRICTIVENESS[c.mode]));
  const winners = candidates.filter((c) => RESTRICTIVENESS[c.mode] === max);
  const mode = winners[0].mode;
  return {
    mode,
    aiMayDraft: mode === "AUTO" || mode === "DRAFT",
    aiMayAutoSend: mode === "AUTO",
    sendsAllowed: !p.emergencyStop && !p.doNotContact && p.accountConnected !== false,
    reasons: winners.map((w) => w.reason),
  };
}

export function label(m: AutomationMode) {
  return { AUTO: "Auto", DRAFT: "Draft", MANUAL: "Manual", PAUSED: "Paused" }[m];
}
