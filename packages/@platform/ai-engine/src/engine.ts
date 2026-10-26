import { baselinePrivacyGuard } from './privacy';
import type { AiCostSink, AiProvider, ChatMessage, CompletionResult, PrivacyGuard } from './types';

export type AiEngineConfig = {
  productId: string;
  provider: AiProvider;
  costSink: AiCostSink;
  /** Defaults to the baseline guard. Passing `null` is not allowed: every product sends only non-identifying data. */
  privacyGuard?: PrivacyGuard;
  /** Model per task tier. Products map their own tiers; the engine never hard-codes a vendor. */
  models: { cheap: string; strong: string };
};

export type AskOptions = { feature: string; userRef?: string | null; tier?: 'cheap' | 'strong'; maxTokens?: number };

const PRODUCT_ID = /^[a-z][a-z0-9-]{1,30}$/;

/** The shared engine: privacy guard → provider → cost row tagged with product + feature. */
export function createAiEngine(cfg: AiEngineConfig) {
  if (!PRODUCT_ID.test(cfg.productId)) throw new Error('ai-engine: invalid productId');
  const guard = cfg.privacyGuard ?? baselinePrivacyGuard;
  return {
    productId: cfg.productId,
    async ask(messages: ChatMessage[], o: AskOptions): Promise<CompletionResult> {
      if (!o.feature) throw new Error('ai-engine: feature is required for cost attribution');
      const model = cfg.models[o.tier ?? 'cheap'];
      const result = await cfg.provider.complete({ model, messages: guard(messages), maxTokens: o.maxTokens });
      try {
        await cfg.costSink.record({ productId: cfg.productId, feature: o.feature, userRef: o.userRef ?? null, model: result.model, usage: result.usage, at: new Date() });
      } catch {
        /* cost logging is best-effort and must never break the reply */
      }
      return result;
    },
  };
}

export type AiEngine = ReturnType<typeof createAiEngine>;

/** In-memory sink for tests and local runs. */
export function createMemoryCostSink() {
  const events: Parameters<AiCostSink['record']>[0][] = [];
  const sink: AiCostSink & { events: typeof events; totalUsd(): number } = {
    events,
    async record(ev) {
      events.push(ev);
    },
    totalUsd: () => events.reduce((s, e) => s + e.usage.costUsd, 0),
  };
  return sink;
}
