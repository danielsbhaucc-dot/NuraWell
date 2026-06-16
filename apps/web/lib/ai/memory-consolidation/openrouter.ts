/**
 * הגדרת OpenRouter ל-Vercel AI SDK — Memory Consolidation (עבודה ברקע).
 */

import 'server-only';
import { createOpenAI } from '@ai-sdk/openai';

import { publicAppUrlForAiReferer } from '../../public-app-url';

/** מודל זול לעיבוד אצווה. Override: OPENROUTER_MEMORY_MODEL */
export const MEMORY_CONSOLIDATION_MODEL =
  process.env.OPENROUTER_MEMORY_MODEL?.trim() || 'meta-llama/llama-3.1-70b-instruct';

export function createOpenRouterAiProvider() {
  return createOpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY?.trim() || 'build-placeholder-key',
    headers: {
      'HTTP-Referer': publicAppUrlForAiReferer(),
      'X-Title': 'NuraWell',
    },
  });
}
