export type ChatRole = 'system' | 'user' | 'assistant';
export type ChatMessage = { role: ChatRole; content: string };

export type AiUsage = {
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  /** Billed cost in USD as reported by the provider (0 for mock). */
  costUsd: number;
};

export type CompletionRequest = {
  model: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
};

export type CompletionResult = { text: string; model: string; usage: AiUsage };

/** Anything that can answer a chat completion: OpenRouter, a direct vendor, or the mock. */
export interface AiProvider {
  readonly id: string;
  complete(req: CompletionRequest, signal?: AbortSignal): Promise<CompletionResult>;
}

/** One metered AI call. `userRef` must be a pseudonymous id (never an email/name). */
export type AiUsageEvent = {
  productId: string;
  feature: string;
  userRef: string | null;
  model: string;
  usage: AiUsage;
  at: Date;
};

/** Where cost rows go (apps/web: ai_usage_events with product_id). Must never throw into the caller. */
export interface AiCostSink {
  record(ev: AiUsageEvent): Promise<void>;
}

/**
 * Outbound privacy guard. Runs on EVERY message before it leaves the server.
 * Products plug in their stronger guard (apps/web: lib/ai/privacy/outbound-pii-guard).
 */
export type PrivacyGuard = (messages: ChatMessage[]) => ChatMessage[];
