import { openrouter } from './client';
import { EMBEDDING_MODEL_OPENROUTER } from './rag-config';

/**
 * Embedding דרך OpenRouter (אותו מפתח כמו הצ'אט).
 * יש ליצור אינדקס Upstash עם מימד תואם למודל (text-embedding-3-small → 1536).
 */
export async function embedTextForRag(text: string): Promise<number[]> {
  const input = text.replace(/\s+/g, ' ').trim().slice(0, 8000);
  if (!input) {
    throw new Error('embedTextForRag: empty input');
  }

  const res = await openrouter.embeddings.create({
    model: EMBEDDING_MODEL_OPENROUTER,
    input,
  });

  const vec = res.data[0]?.embedding;
  if (!vec || !Array.isArray(vec)) {
    throw new Error('embedTextForRag: no embedding in response');
  }

  return vec as number[];
}
