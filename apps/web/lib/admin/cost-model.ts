/**
 * `cost-model` — מודל תמחור מרכזי לעלות AI + Bunny פר-משתמש.
 *
 * מחירוני רשימה (USD ל-1M טוקנים) לפי OpenRouter, אוגוסט 2026.
 * Cache write ל-Claude מחושב לפי TTL של שעה (×2) — ברירת המחדל בצי.
 */

const PER_MILLION = 1_000_000;

export interface ModelPricing {
  /** USD ל-1M טוקני input "טריים" (לא מ-cache). */
  input: number;
  /** USD ל-1M טוקני input שנקראו מ-cache (זול משמעותית). */
  cachedInput: number;
  /** USD ל-1M טוקני כתיבה ל-cache (cache creation). */
  cacheWrite: number;
  /** USD ל-1M טוקני output. */
  output: number;
}

/**
 * טבלת מחירים לפי התאמת regex על שם המודל (כפי שמגיע מ-OpenRouter).
 * הסדר חשוב — הראשון שמתאים מנצח.
 */
const PRICING_TABLE: Array<{ match: RegExp; price: ModelPricing }> = [
  // Claude — Sonnet 5 לפני 4.x; cache write = 1h (×2 input)
  {
    match: /claude[-.]?sonnet[-.]?5(?!\d)/i,
    price: { input: 2, cachedInput: 0.2, cacheWrite: 4, output: 10 },
  },
  { match: /claude.*haiku/i, price: { input: 0.8, cachedInput: 0.08, cacheWrite: 1.6, output: 4 } },
  { match: /claude.*opus/i, price: { input: 15, cachedInput: 1.5, cacheWrite: 30, output: 75 } },
  { match: /claude.*sonnet/i, price: { input: 3, cachedInput: 0.3, cacheWrite: 6, output: 15 } },
  // OpenAI GPT-5.6
  {
    match: /gpt-5\.6-luna|gpt-5-6-luna/i,
    price: { input: 0.2, cachedInput: 0.02, cacheWrite: 0.2, output: 1.2 },
  },
  {
    match: /gpt-5\.6-terra|gpt-5-6-terra/i,
    price: { input: 2.5, cachedInput: 0.25, cacheWrite: 2.5, output: 15 },
  },
  { match: /gpt-5-mini/i, price: { input: 0.25, cachedInput: 0.025, cacheWrite: 0.25, output: 2 } },
  { match: /gpt-5/i, price: { input: 1.25, cachedInput: 0.125, cacheWrite: 1.25, output: 10 } },
  { match: /gpt-4o-mini/i, price: { input: 0.15, cachedInput: 0.075, cacheWrite: 0.15, output: 0.6 } },
  { match: /gpt-4o/i, price: { input: 2.5, cachedInput: 1.25, cacheWrite: 2.5, output: 10 } },
  { match: /gemini.*flash/i, price: { input: 0.375, cachedInput: 0.0375, cacheWrite: 0.375, output: 1.875 } },
  { match: /qwen/i, price: { input: 0.15, cachedInput: 0.15, cacheWrite: 0.15, output: 0.6 } },
  { match: /grok-4\.5|grok 4\.5/i, price: { input: 2, cachedInput: 0.3, cacheWrite: 2, output: 6 } },
  { match: /kimi/i, price: { input: 0.15, cachedInput: 0.15, cacheWrite: 0.15, output: 0.6 } },
  // Llama 4 — Maverick (OpenRouter כותב/נתב) לפני Scout
  {
    match: /llama-4-maverick/i,
    price: { input: 0.2, cachedInput: 0.2, cacheWrite: 0.2, output: 0.7 },
  },
  {
    match: /llama-4-scout/i,
    price: { input: 0.11, cachedInput: 0.055, cacheWrite: 0.11, output: 0.34 },
  },
  { match: /llama-4/i, price: { input: 0.2, cachedInput: 0.2, cacheWrite: 0.2, output: 0.7 } },
  { match: /deepseek/i, price: { input: 0.27, cachedInput: 0.07, cacheWrite: 0.27, output: 1.1 } },
  { match: /text-embedding-3-small/i, price: { input: 0.02, cachedInput: 0.02, cacheWrite: 0.02, output: 0 } },
];

/** מחיר ברירת-מחדל למודל לא מוכר — שמרני (בערך כמו מודל בינוני). */
const DEFAULT_PRICING: ModelPricing = {
  input: 1,
  cachedInput: 0.5,
  cacheWrite: 1.25,
  output: 5,
};

export function resolveModelPricing(modelName: string | null | undefined): ModelPricing {
  const name = (modelName ?? '').trim();
  if (name) {
    for (const { match, price } of PRICING_TABLE) {
      if (match.test(name)) return price;
    }
  }
  return DEFAULT_PRICING;
}

export interface TokenUsage {
  totalTokens?: number | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  cacheReadTokens?: number | null;
  cacheCreationTokens?: number | null;
}

/**
 * עלות הודעת צ'אט בודדת ($) מתוך רשומת usage (tokens_used + metadata).
 * עמיד לשדות חסרים: כל undefined נחשב 0.
 */
export function computeChatCostUsd(
  modelName: string | null | undefined,
  usage: TokenUsage
): number {
  const p = resolveModelPricing(modelName);
  const output = Math.max(0, usage.outputTokens ?? 0);
  const cacheRead = Math.max(0, usage.cacheReadTokens ?? 0);
  const cacheWrite = Math.max(0, usage.cacheCreationTokens ?? 0);
  const input =
    typeof usage.inputTokens === 'number' && Number.isFinite(usage.inputTokens)
      ? Math.max(0, usage.inputTokens)
      : Math.max(0, (usage.totalTokens ?? 0) - output);
  const freshInput = Math.max(0, input - cacheRead - cacheWrite);
  return (
    (freshInput * p.input +
      cacheRead * p.cachedInput +
      cacheWrite * p.cacheWrite +
      output * p.output) /
    PER_MILLION
  );
}

/**
 * עלות פשוטה ($) לפי prompt/completion בלבד (בלי cache) — משמש להתראות.
 */
export function computeSimpleCostUsd(
  modelName: string | null | undefined,
  promptTokens: number,
  completionTokens: number
): number {
  const p = resolveModelPricing(modelName);
  return (
    (Math.max(0, promptTokens) * p.input + Math.max(0, completionTokens) * p.output) /
    PER_MILLION
  );
}

/**
 * נתב כותבים + קובץ שיחה חי רצים Llama 4 Maverick בכל תור ולא נשמרים ב-ai_interactions.
 * אומדן לפי גודל פרומפט טיפוסי.
 */
export function estimateChatBackgroundUsd(assistantMessages: number): number {
  const n = Math.max(0, assistantMessages);
  if (n === 0) return 0;
  const router = computeSimpleCostUsd('meta-llama/llama-4-maverick', 1600, 80);
  const liveFile = computeSimpleCostUsd('meta-llama/llama-4-maverick', 1800, 350);
  return n * (router + liveFile);
}

function numEnv(key: string, fallback: number): number {
  const raw = process.env[key]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** דקות ממוצעות לצפייה בודדת (לפי הגדרת המוצר: כל סרטון ~3 דקות). */
export const BUNNY_MINUTES_PER_VIEW = numEnv('BUNNY_MINUTES_PER_VIEW', 3);

/**
 * מחיר Bunny לדקת הזרמה ($). ברירת מחדל מבוססת על:
 *   ~mobile bitrate (≈2 Mbps) → ~15MB/דקה → ~0.015GB
 *   × ~$0.01/GB (Bunny Stream volume) ≈ $0.00015/דקה.
 *   נלקח קצת גבוה יותר (0.0004) כ-buffer לאזורים יקרים + storage.
 * Override: `BUNNY_USD_PER_MINUTE`.
 */
export const BUNNY_USD_PER_MINUTE = numEnv('BUNNY_USD_PER_MINUTE', 0.0004);

/**
 * עלות Bunny ($) — מעדיף סכום שניות-צפייה אמיתי אם קיים, אחרת נופל
 * ל-(מספר צפיות × דקות-לצפייה).
 */
export function computeVideoCostUsd(views: number, totalSeconds?: number | null): number {
  const minutes =
    typeof totalSeconds === 'number' && totalSeconds > 0
      ? totalSeconds / 60
      : Math.max(0, views) * BUNNY_MINUTES_PER_VIEW;
  return minutes * BUNNY_USD_PER_MINUTE;
}

/** אומדן טוקני prompt להתראה (system + זיכרון + הקשר יום). */
export const NOTIFICATION_ESTIMATED_PROMPT_TOKENS = numEnv(
  'NOTIFICATION_ESTIMATED_PROMPT_TOKENS',
  3200
);
/** אומדן טוקני completion להתראה (push קצר). */
export const NOTIFICATION_ESTIMATED_COMPLETION_TOKENS = numEnv(
  'NOTIFICATION_ESTIMATED_COMPLETION_TOKENS',
  90
);

export interface CostBreakdown {
  chatUsd: number;
  backgroundUsd: number;
  notificationsUsd: number;
  videoUsd: number;
  totalUsd: number;
}

export function emptyBreakdown(): CostBreakdown {
  return { chatUsd: 0, backgroundUsd: 0, notificationsUsd: 0, videoUsd: 0, totalUsd: 0 };
}
