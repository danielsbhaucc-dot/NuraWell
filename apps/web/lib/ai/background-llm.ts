import type OpenAI from 'openai';
import { openrouter } from './client';
import { getGroqClient, isGroqConfigured } from './groq-client';
import {
  MEMORY_EXTRACTION_MODEL_GROQ,
  MEMORY_EXTRACTION_MODEL_OPENROUTER,
} from './rag-config';

/**
 * מודל ל"עבודה שחורה" (חילוץ/איחוד זיכרון) — Groq אם מוגדר, אחרת OpenRouter.
 * מענה למשתמש תמיד GPT-5-mini בנפרד.
 */
export function getBackgroundExtractionLlm(): { client: OpenAI; model: string } {
  if (isGroqConfigured()) {
    return { client: getGroqClient(), model: MEMORY_EXTRACTION_MODEL_GROQ };
  }
  return { client: openrouter, model: MEMORY_EXTRACTION_MODEL_OPENROUTER };
}
