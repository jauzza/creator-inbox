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

/** Chats that recently messaged the bot (from getUpdates), so a beginner never has to look up a chat id. */
export async function recentTelegramChats(token: string): Promise<{ ok: true; chats: { id: string; name: string }[] } | { ok: false; error: string }> {
  try {
    const res = await safeFetch({ url: `https://api.telegram.org/bot${token}/getUpdates?limit=50`, method: "GET", timeoutMs: 15000, allowHosts: ["api.telegram.org"] });
    let data: any = {};
    try {
      data = JSON.parse(res.text);
    } catch {
      /* ignore */
    }
    if (res.status === 401 || res.status === 404) return { ok: false, error: "Telegram rejected the bot token" };
    if (res.status !== 200 || !data.ok) return { ok: false, error: `Telegram HTTP ${res.status}` };
    const seen = new Map<string, string>();
    for (const u of data.result ?? []) {
      const chat = u.message?.chat ?? u.my_chat_member?.chat;
      if (chat?.id != null) seen.set(String(chat.id), [chat.first_name, chat.last_name].filter(Boolean).join(" ") || chat.title || chat.username || "Chat");
    }
    return { ok: true, chats: [...seen].map(([id, name]) => ({ id, name })) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
