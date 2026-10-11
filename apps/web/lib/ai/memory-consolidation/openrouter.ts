import { createAiProvider } from '@/lib/ai/provider-factory';
/**
 * הגדרת OpenRouter ל-Vercel AI SDK — Memory Consolidation (עבודה ברקע).
 */

import 'server-only';


/** מודל זול לעיבוד אצווה. Override: OPENROUTER_MEMORY_MODEL */
export const MEMORY_CONSOLIDATION_MODEL =
  process.env.OPENROUTER_MEMORY_MODEL?.trim() || 'meta-llama/llama-3.1-70b-instruct';

export function createOpenRouterAiProvider() {
  return createAiProvider();
}
