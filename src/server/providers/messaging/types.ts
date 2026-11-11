import type { ConnectionStatus } from "@/generated/prisma/client";

export type ProviderCapabilities = {
  webhooks: boolean;
  polling: boolean;
  idempotentSend: boolean;
  /** We never show typing/read indicators unless a provider truly supports them. */
  typingIndicator: false;
  readReceipts: false;
  /** Paid (PPV) sends via API are disabled in v1 for every provider; see RESEARCH.md. */
  paidMessagesViaApi: false;
  hostedConnect: boolean;
};

export type ProviderAccount = { externalAccountId: string; displayName: string; status: ConnectionStatus; detail?: string };
export type ProviderChat = { externalChatId: string; customerExternalId: string; customerName: string; lastMessageAt?: Date };
export type ProviderMessage = { externalId: string; direction: "INBOUND" | "OUTBOUND"; body: string; sentAt: Date };

export type SendOutcome =
  | { status: "accepted"; providerMessageId: string; replayed?: boolean }
  | { status: "rejected"; error: string }
  | { status: "retryable_not_sent"; error: string; retryAfterMs?: number }
  | { status: "unknown"; error: string };

export type WebhookEventParsed =
  | { kind: "message"; eventId: string; accountExtId: string; chatId: string; customerName?: string; message: ProviderMessage }
  | { kind: "account_status"; eventId: string; accountExtId: string; status: ConnectionStatus; detail: string }
  | { kind: "ignored"; eventId: string; type: string };

export interface MessagingProvider {
  readonly kind: "SIMULATOR" | "ONLYFANSAPI_COM";
  readonly label: string;
  readonly isSimulated: boolean;
  readonly capabilities: ProviderCapabilities;
  testConnection(): Promise<{ ok: boolean; detail: string }>;
  listAccounts(): Promise<ProviderAccount[]>;
  listChats(accountExtId: string, page: { offset: number; limit: number }): Promise<{ chats: ProviderChat[]; hasMore: boolean }>;
  listMessages(accountExtId: string, chatId: string, limit: number): Promise<ProviderMessage[]>;
  sendText(accountExtId: string, chatId: string, text: string, idempotencyKey: string): Promise<SendOutcome>;
  /** Look for a message we may have sent despite an ambiguous result. null = cannot determine. */
  findSent(accountExtId: string, chatId: string, text: string, after: Date): Promise<{ providerMessageId: string } | null | false>;
  verifyWebhook(rawBody: string, headers: Headers): Promise<boolean>;
  parseWebhook(rawBody: string, headers: Headers): WebhookEventParsed[];
}

export class ProviderError extends Error {
  constructor(message: string, public readonly kind: "auth" | "not_found" | "rate_limited" | "network" | "bad_response" | "not_configured" | "forbidden") {
    super(message);
  }
}

export function stripHtml(s: string) {
  return s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}
