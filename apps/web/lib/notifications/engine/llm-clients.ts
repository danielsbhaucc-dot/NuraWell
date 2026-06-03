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

/** OpenAI-compatible client ל-Groq (רקע + fallback אם OpenRouter נופל). */
export const getNotificationBackgroundLLM = () => getClientForModel('background_groq');

/**
 * מודל ראשי לטקסט ההתראה.
 * Override ב-env: `NOTIFICATION_ENGINE_MODEL`.
 */
export const NOTIFICATION_ENGINE_MODEL =
  process.env.NOTIFICATION_ENGINE_MODEL?.trim() || AI_MODELS.empathy;

/**
 * מודל משני (עדיין דרך OpenRouter) למקרה ש-gpt-5-mini החזיר שגיאה/ריק.
 * Override ב-env: `NOTIFICATION_ENGINE_MODEL_SECONDARY`.
 */
export const NOTIFICATION_ENGINE_MODEL_SECONDARY =
  process.env.NOTIFICATION_ENGINE_MODEL_SECONDARY?.trim() || 'openai/gpt-4o-mini';

/**
 * מודל שלישוני — Llama 4 דרך Groq, ספק שונה לחלוטין. נכנס רק אם כל
 * OpenRouter נופל (אזורי outage נדירים).
 */
export const NOTIFICATION_BACKGROUND_MODEL = AI_MODELS.background_groq;
