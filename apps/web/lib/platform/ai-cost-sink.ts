import 'server-only';
import type { AiCostSink } from '@platform/ai-engine';
import { createAdminClient } from '@/lib/supabase/admin';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Bridges the shared engine's cost interface to the existing ai_usage_events table (product_id column from 000192).
 * Same table the console's cost screen already reads, so every product's spend lands in one place.
 */
export function supabaseAiCostSink(db: ReturnType<typeof createAdminClient> = createAdminClient()): AiCostSink {
  return {
    async record(ev) {
      const { error } = await db.from('ai_usage_events').insert({
        product_id: ev.productId,
        feature: ev.feature.slice(0, 80),
        user_id: ev.userRef && UUID.test(ev.userRef) ? ev.userRef : null,
        model: ev.model.slice(0, 120),
        prompt_tokens: ev.usage.promptTokens,
        completion_tokens: ev.usage.completionTokens,
        cached_tokens: ev.usage.cachedTokens,
        cost_usd: ev.usage.costUsd,
        created_at: ev.at.toISOString(),
      });
      if (error) console.error('[ai-cost-sink]', error.message);
    },
  };
}
