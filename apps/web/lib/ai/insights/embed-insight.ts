/**
 * יצירת embedding לתובנות — text-embedding-3-small (1536) דרך OpenRouter + AI SDK.
 * משמש לסנכרון Upstash (לא נשמר ב-Supabase).
 */

import 'server-only';
import { embed } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

import { publicAppUrlForAiReferer } from '../../public-app-url';
import { EMBEDDING_MODEL_OPENROUTER } from '../rag-config';

export const INSIGHT_EMBEDDING_DIMENSION = 1536;

/** כיבוי גלובלי לסנכרון וקטורי תובנות ל-Upstash (recall ייפול ל-ilike). */
export function isInsightEmbeddingEnabled(): boolean {
  return process.env.INSIGHT_EMBEDDING_ENABLED?.trim() !== '0';
}

const openrouterEmbed = createOpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY?.trim() || 'build-placeholder-key',
  headers: {
    'HTTP-Referer': publicAppUrlForAiReferer(),
    'X-Title': 'NuraWell',
  },
});

/**
 * מחזיר וקטור 1536 או null בשגיאה — לעולם לא זורק (בטוח ל-pipeline רקע).
 */
export async function embedInsightText(text: string): Promise<number[] | null> {
  if (!isInsightEmbeddingEnabled()) return null;

  const input = text.replace(/\s+/g, ' ').trim().slice(0, 512);
  if (!input || !process.env.OPENROUTER_API_KEY?.trim()) return null;

  try {
    const { embedding } = await embed({
      model: openrouterEmbed.embedding(EMBEDDING_MODEL_OPENROUTER),
      value: input,
    });

    if (!embedding?.length || embedding.length !== INSIGHT_EMBEDDING_DIMENSION) {
      console.warn('[insights] embed unexpected dimension', { len: embedding?.length });
      return null;
    }

    return embedding;
  } catch (err) {
    console.warn('[insights] embed failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
