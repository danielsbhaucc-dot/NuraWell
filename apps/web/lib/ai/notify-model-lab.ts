/**
 * 🧪 מעבדת מודלים להתראות (Notification Model Lab).
 *
 * מטרה: לבדוק *רק את מודל ניסוח התשובה* של התראות אלמוג מול מספר מודלים,
 * בלי לגעת בזרם ההתראות החי (`completeEmpathyNotifyBody` נשאר בדיוק כמו שהוא).
 *
 * 🛣️ הכול דרך OpenRouter (אותו `OPENROUTER_API_KEY` של הפרודקשן) — *לא* צריך
 * מפתח DeepInfra נפרד. הבקשות מנותבות בעדיפות ל-DeepInfra דרך שדה ה-`provider`
 * של OpenRouter (`order: ['deepinfra']`), עם fallback מותר כדי שבדיקה לא תיפול.
 *
 * הקובץ עומד בפני עצמו:
 *   - createOpenAI ייעודי ל-OpenRouter עם הזרקת ניתוב DeepInfra (fetch wrapper).
 *   - רישום מודלים לבדיקה (`MODEL_LAB_REGISTRY`) — כל ה-slugs אומתו מול קטלוג OR.
 *   - `makeLabBodyCompleter(resolved)` שמחזיר פונקציה תואמת-חתימה ל-
 *     `completeEmpathyNotifyBody`, להזרקה ל-`sendAlmogHabitCheckpointNotification`.
 *
 * ⚠️ אין fallback סטטי (כמו בפרודקשן): אם המודל מחזיר ריק → זורק שגיאה.
 */

import { createOpenAI } from '@ai-sdk/openai';
import { generateText, type ModelMessage } from 'ai';

import { publicAppUrlForAiReferer } from '../public-app-url';

/* ============================================================
 * Provider (OpenRouter → DeepInfra)
 * ============================================================ */

/**
 * מזריק את שדה ה-`provider` של OpenRouter לכל בקשה של המעבדה, כך שהניתוב
 * יעדיף את DeepInfra. מבודד לחלוטין ללקוח של המעבדה — לא משפיע על ה-client
 * של הפרודקשן ב-lib/ai/client.ts או ב-empathy-notify-completion.ts.
 */
const routeToDeepInfraFetch: typeof fetch = async (input, init) => {
  if (init && typeof init.body === 'string') {
    try {
      const json = JSON.parse(init.body) as Record<string, unknown>;
      json.provider = { order: ['deepinfra'], allow_fallbacks: true };
      init = { ...init, body: JSON.stringify(json) };
    } catch {
      /* לא JSON — משאירים כמו שהוא */
    }
  }
  return fetch(input, init);
};

/** OpenRouter (מפתח הפרודקשן) עם העדפת ניתוב ל-DeepInfra. */
const openrouterAi = createOpenAI({
  apiKey: process.env.OPENROUTER_API_KEY?.trim() || '',
  baseURL: 'https://openrouter.ai/api/v1',
  headers: {
    'HTTP-Referer': publicAppUrlForAiReferer(),
    'X-Title': 'NuraWell',
  },
  fetch: routeToDeepInfraFetch,
});

/** Groq — אופציונלי, רק אם רוצים להשוות מול ספק שונה לגמרי. */
const groqAi = createOpenAI({
  apiKey: process.env.GROQ_API_KEY?.trim() || '',
  baseURL: 'https://api.groq.com/openai/v1',
});

export type LabProvider = 'openrouter' | 'groq';

function clientFor(provider: LabProvider): ReturnType<typeof createOpenAI> {
  if (provider === 'groq') return groqAi;
  return openrouterAi;
}

function isProviderConfigured(provider: LabProvider): boolean {
  if (provider === 'groq') return Boolean(process.env.GROQ_API_KEY?.trim());
  return Boolean(process.env.OPENROUTER_API_KEY?.trim());
}

/* ============================================================
 * Model registry — כל ה-slugs אומתו מול קטלוג OpenRouter (יוני 2026)
 * ============================================================ */

export type LabModelEntry = {
  /** מפתח קצר לשימוש ב-API (key ב-body). */
  key: string;
  /** שם תצוגה לבני אדם. */
  label: string;
  provider: LabProvider;
  /** מזהה המודל אצל OpenRouter. */
  model: string;
  /** האם המודל reasoning — אם כן, מקצים budget גדול יותר ל-text הסופי. */
  reasoning?: boolean;
};

export const MODEL_LAB_REGISTRY: LabModelEntry[] = [
  {
    key: 'nemotron-3-ultra',
    label: 'NVIDIA · Nemotron 3 Ultra',
    provider: 'openrouter',
    model: 'nvidia/nemotron-3-ultra-550b-a55b',
    reasoning: true,
  },
  {
    key: 'deepseek-v4-pro',
    label: 'DeepSeek · V4 Pro',
    provider: 'openrouter',
    model: 'deepseek/deepseek-v4-pro',
    reasoning: true,
  },
  {
    key: 'deepseek-v4-flash',
    label: 'DeepSeek · V4 Flash',
    provider: 'openrouter',
    model: 'deepseek/deepseek-v4-flash',
    reasoning: true,
  },
  {
    key: 'mimo-v2.5-pro',
    label: 'Xiaomi · MiMo-V2.5-Pro',
    provider: 'openrouter',
    model: 'xiaomi/mimo-v2.5-pro',
    reasoning: true,
  },
  {
    key: 'kimi-k2.6',
    label: 'Moonshot · Kimi K2.6',
    provider: 'openrouter',
    model: 'moonshotai/kimi-k2.6',
    reasoning: true,
  },
  {
    key: 'minimax-m2.7',
    label: 'MiniMax · M2.7',
    provider: 'openrouter',
    model: 'minimax/minimax-m2.7',
    reasoning: true,
  },
  {
    key: 'glm-4.7',
    label: 'Z-AI · GLM 4.7',
    provider: 'openrouter',
    model: 'z-ai/glm-4.7',
    reasoning: true,
  },
  {
    key: 'glm-4.7-flash',
    label: 'Z-AI · GLM 4.7 Flash',
    provider: 'openrouter',
    model: 'z-ai/glm-4.7-flash',
    reasoning: true,
  },
  {
    key: 'llama-4',
    label: 'Meta · Llama 4 Maverick',
    provider: 'openrouter',
    model: 'meta-llama/llama-4-maverick',
  },
  {
    key: 'phi-4',
    label: 'Microsoft · Phi 4',
    provider: 'openrouter',
    model: 'microsoft/phi-4',
  },
];

const REGISTRY_BY_KEY = new Map(MODEL_LAB_REGISTRY.map((m) => [m.key, m]));

export type ResolvedLabModel = {
  key: string;
  label: string;
  provider: LabProvider;
  model: string;
  reasoning: boolean;
  configured: boolean;
};

/**
 * ממיר קלט (key מהרישום, או "provider:model", או model גולמי) למודל פתור.
 * מאפשר לבדוק כל מודל גם אם אינו ברישום.
 */
export function resolveLabModel(input: string): ResolvedLabModel {
  const trimmed = input.trim();

  const fromRegistry = REGISTRY_BY_KEY.get(trimmed);
  if (fromRegistry) {
    return {
      key: fromRegistry.key,
      label: fromRegistry.label,
      provider: fromRegistry.provider,
      model: fromRegistry.model,
      reasoning: Boolean(fromRegistry.reasoning),
      configured: isProviderConfigured(fromRegistry.provider),
    };
  }

  /** תחביר חופשי: "openrouter:vendor/model" / "groq:..." (ברירת מחדל openrouter). */
  let provider: LabProvider = 'openrouter';
  let model = trimmed;
  const sep = trimmed.indexOf(':');
  if (sep > 0) {
    const maybeProvider = trimmed.slice(0, sep);
    if (maybeProvider === 'openrouter' || maybeProvider === 'groq') {
      provider = maybeProvider;
      model = trimmed.slice(sep + 1);
    }
  }

  return {
    key: trimmed,
    label: `${provider} · ${model}`,
    provider,
    model,
    reasoning: false,
    configured: isProviderConfigured(provider),
  };
}

/* ============================================================
 * Body completer (תואם לחתימת completeEmpathyNotifyBody)
 * ============================================================ */

const MIN_NOTIFY_BODY_CHARS = 6;
const MAX_BODY_CHARS = 320;

type LabCompletionOptions = {
  messages: ModelMessage[];
  maxTokens?: number;
  temperature?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  label?: string;
  recipientFirstName?: string;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasUnresolvedPlaceholder(value: string): boolean {
  return /\[(?:PERSON_NAME|USER_FIRST_NAME|FIRST_NAME|שם|Task|TASK|task|משימה)\]/i.test(value);
}

function stripLeadingRecipientName(value: string, firstName?: string): string {
  const name = firstName?.trim();
  if (!name) return value;
  const escapedName = escapeRegExp(name);
  return value
    .replace(new RegExp(`^(?:אחי\\s+)?${escapedName}ל{0,4}[!！.,،:;\\-–—\\s]*`, 'u'), '')
    .trim();
}

/** זהה ללוגיקת הפוסט-פרוססינג בפרודקשן — כדי שההשוואה בין מודלים תהיה הוגנת. */
function postProcessBody(raw: string, firstName?: string): string {
  let cleaned = raw.trim();
  if (!cleaned) return '';
  cleaned = cleaned.replace(/^["'״׳`]+|["'״׳`]+$/g, '').trim();
  cleaned = cleaned.replace(/\s*\n+\s*/g, ' ').trim();
  cleaned = stripLeadingRecipientName(cleaned, firstName);
  if (cleaned.length > MAX_BODY_CHARS) {
    cleaned = `${cleaned.slice(0, MAX_BODY_CHARS - 1).trimEnd()}…`;
  }
  return cleaned;
}

/**
 * מייצר completer לגוף ההתראה עבור מודל ספציפי.
 * החתימה תואמת ל-`completeEmpathyNotifyBody` כדי שאפשר יהיה להזריק אותה
 * ישירות ל-`sendAlmogHabitCheckpointNotification` דרך `overrides.completeBody`.
 */
export function makeLabBodyCompleter(
  resolved: ResolvedLabModel
): (options: LabCompletionOptions) => Promise<string> {
  return async (options: LabCompletionOptions): Promise<string> => {
    if (!resolved.configured) {
      throw new Error(
        `[model-lab] provider "${resolved.provider}" not configured (missing API key) for model ${resolved.model}`
      );
    }

    const temperature = options.temperature ?? 0.85;
    /** budget נדיב — מודלי reasoning עלולים "לאכול" טוקנים; הפוסט-פרוסס חותך ל-320 תווים. */
    const baseMax = options.maxTokens ?? 400;
    const maxOutputTokens = resolved.reasoning
      ? Math.max(baseMax, 1500)
      : Math.max(baseMax, 280);

    const client = clientFor(resolved.provider);
    const errors: string[] = [];
    let lastFinishReason: string | undefined;

    const attempts = 2;
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const out = await generateText({
          model: client.chat(resolved.model),
          temperature: Math.min(1, temperature + attempt * 0.05),
          maxOutputTokens:
            attempt === 0 ? maxOutputTokens : Math.min(maxOutputTokens + 300, 2000),
          ...(options.presencePenalty != null
            ? { presencePenalty: options.presencePenalty }
            : {}),
          ...(options.frequencyPenalty != null
            ? { frequencyPenalty: options.frequencyPenalty }
            : {}),
          messages: options.messages,
        });

        lastFinishReason = out.finishReason;
        const body = postProcessBody(out.text ?? '', options.recipientFirstName);

        if (body.length >= MIN_NOTIFY_BODY_CHARS && !hasUnresolvedPlaceholder(body)) {
          return body;
        }

        errors.push(
          `${resolved.model}#${attempt}: ${
            hasUnresolvedPlaceholder(body) ? 'unresolved placeholder' : 'empty/short'
          } (finishReason=${out.finishReason}, len=${body.length})`
        );
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        errors.push(`${resolved.model}#${attempt}: ${msg}`);
      }
    }

    const finishHint = lastFinishReason ? ` finish_reason=${lastFinishReason};` : '';
    throw new Error(
      `[model-lab] model ${resolved.provider}:${resolved.model} failed;${finishHint} errors=${errors.join(' | ')}`
    );
  };
}
