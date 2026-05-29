/**
 * LLM clients ל-Notification Engine.
 *
 * החלטות ארכיטקטורה:
 *   • טקסט ההתראה (user-facing, אמפתי, רגיש-טון) — **OpenRouter** עם
 *     `openai/gpt-5-mini`. זה גם המודל המוגדר כ-`AI_MODELS.empathy`
 *     בכל שאר האפליקציה, אז יש קוהרנטיות של טון על פני כל ערוצי ה-AI.
 *   • "עבודה שחורה ברקע" (סיווגים, decision routing, סיכומים פנימיים) —
 *     **Groq** עם `meta-llama/llama-4-scout-17b-16e-instruct`. מהיר מאוד
 *     וזול ב-volume, אידיאלי לפעולות שאינן נראות למשתמש.
 *
 * הקובץ הזה לא יוצר client חדש — הוא re-export של ה-singletons
 * ב-`lib/ai/client.ts` כדי לשמור על client אחד per ספק ב-runtime.
 */

import { AI_MODELS, getClientForModel } from '../../ai/client';

/** OpenAI-compatible client ל-OpenRouter (משמש לטקסט ההתראה). */
export const getNotificationLLM = () => getClientForModel('empathy');

/** OpenAI-compatible client ל-Groq (משמש לעבודה ברקע, אם יתווסף בעתיד). */
export const getNotificationBackgroundLLM = () => getClientForModel('background_groq');

/** מודל ברירת מחדל לטקסט ההתראה. Override ב-env: `NOTIFICATION_ENGINE_MODEL`. */
export const NOTIFICATION_ENGINE_MODEL =
  process.env.NOTIFICATION_ENGINE_MODEL?.trim() || AI_MODELS.empathy;

/** מודל ברירת מחדל לעבודה ברקע ב-engine. */
export const NOTIFICATION_BACKGROUND_MODEL = AI_MODELS.background_groq;
