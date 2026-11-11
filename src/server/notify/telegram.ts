import { safeFetch } from "../net/safeFetch";

export type TelegramResult = { ok: true } | { ok: false; retryAfterMs?: number; error: string; permanent: boolean };

export async function sendTelegram(token: string, chatId: string, text: string): Promise<TelegramResult> {
  try {
    const res = await safeFetch({
      url: `https://api.telegram.org/bot${token}/sendMessage`,
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 3500), disable_web_page_preview: true }),
      timeoutMs: 15000,
      allowHosts: ["api.telegram.org"],
    });
    let data: any = {};
    try {
      data = JSON.parse(res.text);
    } catch {
      /* ignore */
    }
    if (res.status === 200 && data.ok) return { ok: true };
    if (res.status === 429) return { ok: false, retryAfterMs: Number(data?.parameters?.retry_after ?? 30) * 1000, error: "Telegram rate limit", permanent: false };
    if (res.status === 401 || res.status === 404) return { ok: false, error: "Telegram rejected the bot token", permanent: true };
    if (res.status === 400) return { ok: false, error: `Telegram: ${String(data?.description ?? "bad request").slice(0, 120)}`, permanent: true };
    return { ok: false, error: `Telegram HTTP ${res.status}`, permanent: false };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), permanent: false };
  }
}
