/**
 * AI clients for NuraWell.
 *
 * Uses the official `openai` SDK (Chat Completions API) but points it at:
 *  - OpenRouter for empathetic / critical user-facing models (GPT-5 family).
 *  - DeepSeek directly for cheap background analysis tasks.
 *
 * All clients are created once per server runtime (singleton modules).
 */

import OpenAI from 'openai';
import { publicAppUrlForAiReferer } from '../public-app-url';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1';
const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';

const APP_URL = publicAppUrlForAiReferer();
const APP_TITLE = 'NuraWell';

/** Allows `next build` without secrets; runtime calls fail with 401 if keys are missing. */
const BUILD_SAFE_API_KEY = 'build-placeholder-key';

if (!process.env.OPENROUTER_API_KEY && process.env.NODE_ENV === 'production') {
  // eslint-disable-next-line no-console
  console.warn('[ai/client] OPENROUTER_API_KEY is missing - OpenRouter calls will 401.');
}

if (!process.env.DEEPSEEK_API_KEY && process.env.NODE_ENV === 'production') {
  // eslint-disable-next-line no-console
  console.warn('[ai/client] DEEPSEEK_API_KEY is missing - DeepSeek calls will 401.');
}

if (!process.env.GROQ_API_KEY && process.env.NODE_ENV === 'production') {
  // eslint-disable-next-line no-console
  console.warn('[ai/client] GROQ_API_KEY is missing - Groq calls will 401.');
}

/**
 * OpenRouter client. Headers `HTTP-Referer` and `X-Title` are recommended by
 * OpenRouter so usage shows up under the right app in their dashboard.
 */
export const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY?.trim() || BUILD_SAFE_API_KEY,
  baseURL: OPENROUTER_BASE_URL,
  defaultHeaders: {
    'HTTP-Referer': APP_URL,
    'X-Title': APP_TITLE,
  },
});

/**
 * DeepSeek client. Used for cheap, batch-style analytics from cron jobs.
 */
export const deepseek = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY?.trim() || BUILD_SAFE_API_KEY,
  baseURL: DEEPSEEK_BASE_URL,
});

/**
 * Groq client (OpenAI-compatible REST). מנוע מהיר וזול עם LLaMA 4 —
 * ספק ברירת המחדל שלנו ל"עבודה שחורה ברקע" של פיצ'רים חדשים
 * (סיווגים, סיכומי שיחה, decision routing, batch analytics קצרים).
 *
 * הערה: לא מחליף את `deepseek` הקיים כדי לא לשבור צרכנים קיימים —
 * שימוש חדש ב-background AI יעדיף את `groq` עם `AI_MODELS.background_groq`.
 */
export const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY?.trim() || BUILD_SAFE_API_KEY,
  baseURL: GROQ_BASE_URL,
});

/**
 * Canonical model ids used across the app. Kept here so swapping a model
 * is a one-line change.
 */
export const AI_MODELS = {
  /**
   * Default user-facing model: empathetic, fast, cheap. מנסח את ההתראות
   * וההודעות של אלמוג. ניתן לדריסה ב-env `EMPATHY_MODEL` כדי לנסות מודלים
   * אחרים בלי שינוי קוד (ניסוי Qwen נוכחי: qwen/qwen3.7-plus).
   */
  empathy: process.env.EMPATHY_MODEL?.trim() || 'qwen/qwen3.7-plus',
  /** Reserved for high-stakes moments (re-engagement after long absence). */
  critical: 'openai/gpt-5',
  /** Legacy DeepSeek background id; cron uses `getDeepseekAnalysisModel()` (same default, env override). */
  background: 'deepseek-chat',
  /**
   * Groq + LLaMA 4 Scout — ברירת המחדל החדשה לכל background AI
   * (סיווגים, סיכומים, דיסיז'ן-רוטר וכו'). מהיר משמעותית מ-DeepSeek
   * וזול יותר ב-volume של פיצ'רים שאינם user-facing.
   * Override ב-env: `GROQ_BACKGROUND_MODEL`.
   */
  background_groq:
    process.env.GROQ_BACKGROUND_MODEL?.trim() ||
    'meta-llama/llama-4-scout-17b-16e-instruct',
} as const;

export type AiModelKind = keyof typeof AI_MODELS;
export type AiModelId = (typeof AI_MODELS)[AiModelKind];

/**
 * Returns the right SDK client for a given model kind.
 *   • `empathy` / `critical` → OpenRouter (GPT-5 family).
 *   • `background`           → DeepSeek (legacy).
 *   • `background_groq`      → Groq (LLaMA 4 — מועדף לעבודה ברקע).
 */
export function getClientForModel(kind: AiModelKind): OpenAI {
  if (kind === 'background') return deepseek;
  if (kind === 'background_groq') return groq;
  return openrouter;
}
