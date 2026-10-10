/**
 * AI clients for NuraWell.
 *
 * Uses the official `openai` SDK (Chat Completions API) but points it at:
 *  - OpenRouter for empathetic / critical user-facing models (GPT-5 family).
 *  - DeepSeek directly for cheap background analysis tasks.
 *
 * All clients are created once per server runtime (singleton modules).
 */

import 'server-only';

import OpenAI from 'openai';
import {
  groqCompatFetch,
  groqLaneApiKey,
  groqLaneBaseUrl,
  groqLaneUsesDirectGroq,
} from './groq-compat';
import { publicAppUrlForAiReferer } from '../public-app-url';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1';

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
  /** אין GROQ_API_KEY → אותו נתיב דרך OpenRouter עם העדפת ספק Groq (ראה groq-compat.ts). */
  apiKey: groqLaneApiKey() || BUILD_SAFE_API_KEY,
  baseURL: groqLaneBaseUrl(),
  defaultHeaders: groqLaneUsesDirectGroq()
    ? undefined
    : { 'HTTP-Referer': APP_URL, 'X-Title': APP_TITLE },
  /** gpt-oss: reasoning_effort=low + reasoning budget headroom (see groq-compat.ts) */
  fetch: groqCompatFetch,
});

/**
 * Canonical model ids used across the app. Kept here so swapping a model
 * is a one-line change.
 */
export const AI_MODELS = {
  /** Default user-facing model: empathetic, fast, cheap. */
  empathy: 'openai/gpt-5-mini',
  /** Reserved for high-stakes moments (re-engagement after long absence). */
  critical: 'openai/gpt-5',
  /** Legacy DeepSeek background id; cron uses `getDeepseekAnalysisModel()` (same default, env override). */
  background: 'deepseek-chat',
  /**
   * Groq "light" model for background work: classifiers, emoji reaction,
   * short notification texts, daily actions, summary fallbacks.
   * Llama 4 Scout was retired on Groq (2026-07-17); gpt-oss-20b is Groq's recommended
   * replacement and is cheaper ($0.075 / $0.30 per 1M in/out vs Scout ~$0.11 / $0.34).
   * Override: `GROQ_BACKGROUND_MODEL`.
   */
  background_groq:
    process.env.GROQ_BACKGROUND_MODEL?.trim() || 'openai/gpt-oss-20b',
  /**
   * Groq "strong" model for generation: onboarding conversation, program proposal,
   * guide companion, admin content generation (journey / step / guide), research scan.
   * Replaces llama-3.3-70b-versatile ($0.59 / $0.79), which was retired on 2026-08-16.
   * gpt-oss-120b: $0.15 / $0.60. Override: `GROQ_STRONG_MODEL`.
   */
  background_groq_strong:
    process.env.GROQ_STRONG_MODEL?.trim() || 'openai/gpt-oss-120b',
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
  if (kind === 'background_groq' || kind === 'background_groq_strong') return groq;
  return openrouter;
}
