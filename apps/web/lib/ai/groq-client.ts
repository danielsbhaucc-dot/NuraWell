import OpenAI from 'openai';

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';

/** מודלים זולים לחילוץ/איחוד זיכרון — לא למענה למשתמש. */
export const GROQ_BACKGROUND_MODEL = 'llama-3.3-70b-versatile';

let groqSingleton: OpenAI | null = null;

export function isGroqConfigured(): boolean {
  return Boolean(process.env.GROQ_API_KEY?.trim());
}

/**
 * Groq (OpenAI-compatible) — "עבודה שחורה": חילוץ עובדות, איחוד זיכרון.
 * מענה למשתמש נשאר תמיד GPT-5-mini דרך OpenRouter.
 */
export function getGroqClient(): OpenAI {
  const key = process.env.GROQ_API_KEY?.trim();
  if (!key) {
    throw new Error('GROQ_API_KEY is not set');
  }
  if (!groqSingleton) {
    groqSingleton = new OpenAI({
      apiKey: key,
      baseURL: GROQ_BASE_URL,
    });
  }
  return groqSingleton;
}
