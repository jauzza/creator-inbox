import type { Job } from "@/generated/prisma/client";
import { db } from "../db";
import { generateReply } from "../services/drafting";
import { dispatchDraft, dispatchManual, reconcileSend } from "../services/dispatch";
import { syncAccount } from "../services/sync";
import { resume } from "../services/controls";
import { getSecret } from "../crypto/secrets";
import { sendTelegram } from "../notify/telegram";
import { env } from "../env";
import { executeEvalRun } from "../evals/runner";

export type HandlerResult = { outcome: string; rescheduleAt?: Date; retryInMs?: number; permanentError?: string };

export async function runJob(job: Job): Promise<HandlerResult> {
  const p = (job.payload ?? {}) as Record<string, any>;
  switch (job.type) {
    case "generate_reply":
      return generateReply(job.conversationId!);
    case "dispatch_draft":
      return dispatchDraft(String(p.draftId));
    case "dispatch_manual":
      return dispatchManual(String(p.sendId));
    case "reconcile_send":
      return reconcileSend(String(p.sendId), Number(p.check ?? 1));
    case "sync_account":
      return syncAccount(String(p.accountId));
    case "expire_takeover": {
      const c = await db().conversation.findUnique({ where: { id: job.conversationId! } });
      if (!c?.takenOverById || !c.takeoverExpiresAt || c.takeoverExpiresAt > new Date()) return { outcome: "not expired" };
      await resume(null, c.id, "Takeover expiry rule");
      return { outcome: "resumed by expiry rule" };
    }
    case "notify_telegram": {
      const n = await db().notification.findUnique({ where: { id: String(p.notificationId) } });
      if (!n) return { outcome: "missing" };
      const cfg = await db().integrationConfig.findUnique({ where: { id: "telegram" } });
      const token = await getSecret("telegram.bot");
      const chatId = String((cfg?.settings as any)?.chatId ?? "");
      if (!cfg?.enabled || !token || !chatId) return { outcome: "telegram not configured" };
      const link = n.link ? `\n${env().APP_URL}${n.link}` : "";
      const r = await sendTelegram(token, chatId, `${n.title}\n${n.body}${link}`);
      if (r.ok) return { outcome: "sent" };
      if (r.permanent) return { outcome: "failed", permanentError: r.error };
      return { outcome: "retry", retryInMs: r.retryAfterMs ?? 30000 };
    }
    case "run_eval":
      await executeEvalRun(String(p.runId));
      return { outcome: "eval run finished" };
    default:
      return { outcome: "unknown job type", permanentError: `Unknown job type ${job.type}` };
  }
}
