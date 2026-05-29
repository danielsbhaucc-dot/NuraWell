/**
 * OpenAI client ייעודי למנוע ההתראות (gpt-4o-mini).
 *
 * מודע ש-AI הראשי באפליקציה רץ ב-OpenRouter (`lib/ai/client.ts`).
 * אבל הספק שהוגדר ל-engine הזה הוא **OpenAI ישיר** עם gpt-4o-mini —
 * זול ומהיר, אידיאלי לטקסטים קצרצרים של push.
 *
 * הקובץ singleton; מייצר client רק אם `OPENAI_API_KEY` הוגדר. בזמן build
 * אין מפתח, ולכן אנחנו נופלים ל-placeholder וקריאות runtime יזרקו 401
 * אם המפתח חסר (ניתן לזיהוי מיידי בלוגים של Workflow).
 */

import OpenAI from 'openai';

const BUILD_SAFE_API_KEY = 'build-placeholder-openai-key';

if (!process.env.OPENAI_API_KEY && process.env.NODE_ENV === 'production') {
  // eslint-disable-next-line no-console
  console.warn(
    '[notifications/openai-client] OPENAI_API_KEY is missing — notification engine will 401.'
  );
}

let cached: OpenAI | null = null;

export function getNotificationEngineOpenAI(): OpenAI {
  if (cached) return cached;
  cached = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY?.trim() || BUILD_SAFE_API_KEY,
  });
  return cached;
}

/** מודל ברירת מחדל — אפשר לעקוף ב-env לטסטים A/B. */
export const NOTIFICATION_ENGINE_MODEL =
  process.env.NOTIFICATION_ENGINE_MODEL?.trim() || 'gpt-4o-mini';
