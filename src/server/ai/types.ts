export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type CompletionRequest = {
  messages: ChatMessage[];
  model: string;
  json: boolean;
  maxTokens: number;
  temperature?: number | null;
  topP?: number | null;
  thinking?: "enabled" | "disabled";
  timeoutMs: number;
};

export type CompletionResult = { text: string; tokensIn: number; tokensOut: number; latencyMs: number; model: string };

export class AiError extends Error {
  constructor(message: string, public readonly kind: "auth" | "rate_limited" | "timeout" | "bad_response" | "unavailable_model" | "network" | "blocked") {
    super(message);
  }
}

export interface AiProvider {
  readonly id: string;
  readonly label: string;
  readonly isOffline: boolean;
  complete(req: CompletionRequest): Promise<CompletionResult>;
  /** null when the endpoint does not support listing models */
  listModels(): Promise<string[] | null>;
}
