import { createAiEngine, createMemoryCostSink, createMockProvider, createOpenAiCompatibleProvider, type AiCostSink, type AiProvider } from '@platform/ai-engine';
import { createAuth, memoryAuthAdapter, type AuthAdapter } from '@platform/auth';

export const PRODUCT_ID = 'sample';

type Env = Record<string, string | undefined>;

/** Mock by default (free, offline). A real provider only when explicitly enabled AND a key is injected. */
export function pickProvider(env: Env = process.env): AiProvider {
  if (env.SAMPLE_AI_PROVIDER === 'live' && env.SAMPLE_AI_API_KEY) {
    return createOpenAiCompatibleProvider({ apiKey: env.SAMPLE_AI_API_KEY, title: 'Sample product', timeoutMs: 20_000 });
  }
  return createMockProvider();
}

export function makeEngine(opts: { provider?: AiProvider; costSink?: AiCostSink; env?: Env } = {}) {
  return createAiEngine({
    productId: PRODUCT_ID,
    provider: opts.provider ?? pickProvider(opts.env),
    costSink: opts.costSink ?? createMemoryCostSink(),
    models: { cheap: 'openai/gpt-4o-mini', strong: 'openai/gpt-4o-mini' },
  });
}

/** Demo user only when no shared login is configured (local dev / CI). Production would use the Supabase adapter. */
export const DEMO_USER = { id: '00000000-0000-4000-8000-000000000001', email: null };

export function makeAuth(adapter: AuthAdapter = memoryAuthAdapter(DEMO_USER, [{ userId: DEMO_USER.id, productId: PRODUCT_ID }])) {
  return createAuth({ productId: PRODUCT_ID, adapter, requireMembership: true });
}
