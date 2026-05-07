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

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://nurawell.ai';
const APP_TITLE = 'NuraWell';

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
  apiKey: process.env.OPENROUTER_API_KEY ?? '',
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
  apiKey: process.env.DEEPSEEK_API_KEY ?? '',
  baseURL: DEEPSEEK_BASE_URL,
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
  /** Background analytics via DeepSeek's native API. */
  background: 'deepseek-chat',
} as const;

export type AiModelKind = keyof typeof AI_MODELS;
export type AiModelId = (typeof AI_MODELS)[AiModelKind];

/**
 * Returns the right SDK client for a given model kind.
 * `empathy` and `critical` go through OpenRouter, `background` goes direct
 * to DeepSeek.
 */
export function getClientForModel(kind: AiModelKind): OpenAI {
  if (kind === 'background') return deepseek;
  return openrouter;
}
