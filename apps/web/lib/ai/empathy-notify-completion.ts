import { createOpenAI } from '@ai-sdk/openai';
import { generateText, type ModelMessage } from 'ai';

import { AI_MODELS } from './client';
import { ALMOG_NOTIFY_MAX_OUTPUT_TOKENS } from './prompts';
import { publicAppUrlForAiReferer } from '../public-app-url';

/**
 * 📣 מנוע יצירת טקסט להתראות אלמוג.
 *
 * 🎯 עיקרון הליבה (הוחלף ב-2026-05-31): *אין fallback סטטי*. אם כל ה-LLM
 * providers נכשלים — זורקים שגיאה. צרכן שיודע שזו התראה לא יכניס שום
 * רשומה ל-DB (וה-user לא יקבל push). עדיף שקט מהודעה רובוטית.
 *
 * ⚙️ Provider chain (לפי סדר אמינות לנוטיפיקציות אנושיות):
 *   1. `openai/gpt-4o-mini`    — דרך OpenRouter. *מודל ראשי*. אין reasoning
 *                                tokens שאוכלים את ה-output budget; חוזר
 *                                מהר עם טקסט מלא. עברית טבעית מצוינת.
 *   2. `openai/gpt-5-mini`     — דרך OpenRouter. backup; משתמש ב-reasoning
 *                                ולכן דורש budget גדול יותר.
 *   3. `meta-llama/llama-4-scout` דרך Groq — ספק שונה לחלוטין; backup
 *                                ל-OpenRouter outage.
 *
 * 🔁 לכל provider — מספר ניסיונות עם temperature/seed שונים.
 *
 * 🛑 לא דוחים הודעה רק כי היא לא נגמרת בנקודה — אימוג'י/אות עברית בסוף הוא
 * סיום לגיטימי לוואטסאפ. רק `finishReason === 'length'` *בלי טקסט* או
 * טקסט קצר מ-6 תווים נחשב כשלון.
 */

const MIN_NOTIFY_BODY_CHARS = 6;
const MAX_BODY_CHARS = 320;

/** ספקי override אפשריים לכלי הבדיקה (admin). אינם משנים את הזרימה הרגילה. */
export type EmpathyModelProvider = 'openrouter' | 'groq' | 'deepseek';

export type EmpathyModelOverride = {
  provider: EmpathyModelProvider;
  model: string;
};

type EmpathyNotifyCompletionOptions = {
  messages: ModelMessage[];
  maxTokens?: number;
  temperature?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  label?: string;
  /**
   * 🧪 override מודל יחיד (כלי בדיקה admin בלבד). כשמסופק — משתמשים *רק*
   * בספק/מודל הזה, בלי שרשרת ה-fallback הרגילה. ברירת מחדל undefined →
   * התנהגות זהה לחלוטין לזרימה העובדת.
   */
  modelOverride?: EmpathyModelOverride;
};

const openrouterAi = createOpenAI({
  apiKey: process.env.OPENROUTER_API_KEY ?? '',
  baseURL: 'https://openrouter.ai/api/v1',
  headers: {
    'HTTP-Referer': publicAppUrlForAiReferer(),
    'X-Title': 'NuraWell',
  },
});

const groqAi = createOpenAI({
  apiKey: process.env.GROQ_API_KEY ?? '',
  baseURL: 'https://api.groq.com/openai/v1',
});

const deepseekAi = createOpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY ?? '',
  baseURL: 'https://api.deepseek.com/v1',
});

/**
 * בונה ספק יחיד מ-override (כלי בדיקה admin). מחזיר provider chain בן פריט
 * אחד עם 2 ניסיונות — בלי ה-fallback הרגיל, כדי שהבדיקה תשקף את המודל הנבחר.
 */
function providerFromOverride(override: EmpathyModelOverride): NotifyProvider {
  const chat =
    override.provider === 'groq'
      ? groqAi
      : override.provider === 'deepseek'
        ? deepseekAi
        : openrouterAi;
  return {
    label: `override:${override.provider}`,
    model: override.model,
    chat,
    attempts: 2,
    isReasoningModel: override.model.includes('gpt-5'),
  };
}

type NotifyProvider = {
  label: string;
  model: string;
  chat: ReturnType<typeof createOpenAI>;
  attempts: number;
  /**
   * האם המודל משתמש ב-reasoning tokens (משפחת GPT-5).
   * אם כן — דורש budget גדול יותר ושולחים `reasoningEffort: 'minimal'`.
   * אם לא — output budget הולך כולו לטקסט; אפשר לקצר.
   */
  isReasoningModel: boolean;
};

const NOTIFICATION_PRIMARY_MODEL =
  process.env.NOTIFICATION_EMPATHY_MODEL?.trim() || 'openai/gpt-4o-mini';

function notifyProviders(): NotifyProvider[] {
  const providers: NotifyProvider[] = [];

  if (process.env.OPENROUTER_API_KEY?.trim()) {
    providers.push({
      label: 'openrouter-primary',
      model: NOTIFICATION_PRIMARY_MODEL,
      chat: openrouterAi,
      attempts: 2,
      isReasoningModel: NOTIFICATION_PRIMARY_MODEL.includes('gpt-5'),
    });

    if (AI_MODELS.empathy !== NOTIFICATION_PRIMARY_MODEL) {
      providers.push({
        label: 'openrouter-secondary',
        model: AI_MODELS.empathy,
        chat: openrouterAi,
        attempts: 1,
        isReasoningModel: AI_MODELS.empathy.includes('gpt-5'),
      });
    }
  }

  if (process.env.GROQ_API_KEY?.trim()) {
    providers.push({
      label: 'groq',
      model: AI_MODELS.background_groq,
      chat: groqAi,
      attempts: 1,
      isReasoningModel: false,
    });
  }

  return providers;
}

/** טוקנים מינימליים לפי סוג המודל (reasoning vs רגיל). */
function resolveMaxOutputTokens(
  requested: number,
  isReasoningModel: boolean
): number {
  if (isReasoningModel) {
    // GPT-5 mini מקצה reasoning פנימי — צריך budget גדול דיו ש-text הסופי
    // לא ייצא ריק (זה השורש של "Empty empathy model output").
    return Math.max(requested, 800);
  }
  // gpt-4o-mini / Llama / etc — אין reasoning, output מגיע מיד.
  // 250 תווים בעברית ≈ 120-150 טוקנים. נשאיר רוחב כדי לא להיחתך.
  return Math.max(requested, 220);
}

function postProcessBody(raw: string): string {
  let cleaned = raw.trim();
  if (!cleaned) return '';
  // הסרת גרשיים פותחים/סוגרים שהמודל לפעמים מוסיף
  cleaned = cleaned.replace(/^["'״׳`]+|["'״׳`]+$/g, '').trim();
  // איחוד שורות מרובות לרווח אחד (push notification = שורה אחת)
  cleaned = cleaned.replace(/\s*\n+\s*/g, ' ').trim();
  if (cleaned.length > MAX_BODY_CHARS) {
    cleaned = `${cleaned.slice(0, MAX_BODY_CHARS - 1).trimEnd()}…`;
  }
  return cleaned;
}

/**
 * טקסט לנוטיפיקציות מאלמוג.
 *
 * זורק `Error` אם כל ה-providers נכשלו (אין fallback סטטי).
 * הצרכן אחראי לבחור אם לדלג על השליחה (לא להכניס notification ל-DB).
 */
export async function completeEmpathyNotifyBody(
  options: EmpathyNotifyCompletionOptions
): Promise<string> {
  const temperature = options.temperature ?? 0.85;
  const requestedMaxTokens = options.maxTokens ?? ALMOG_NOTIFY_MAX_OUTPUT_TOKENS;

  const providers = options.modelOverride
    ? [providerFromOverride(options.modelOverride)]
    : notifyProviders();
  if (providers.length === 0) {
    throw new Error(
      '[empathy-notify] no LLM providers configured (missing OPENROUTER_API_KEY and GROQ_API_KEY)'
    );
  }

  const errors: string[] = [];
  let lastFinishReason: string | undefined;

  for (const provider of providers) {
    const attemptMaxTokens = resolveMaxOutputTokens(
      requestedMaxTokens,
      provider.isReasoningModel
    );

    for (let attempt = 0; attempt < provider.attempts; attempt++) {
      try {
        const tempForAttempt = Math.min(
          1,
          temperature + attempt * 0.05
        );

        const out = await generateText({
          model: provider.chat.chat(provider.model),
          temperature: tempForAttempt,
          maxOutputTokens:
            attempt === 0
              ? attemptMaxTokens
              : Math.min(attemptMaxTokens + 200, 1600),
          ...(provider.isReasoningModel
            ? {
                providerOptions: {
                  // 'minimal' חוסך טוקנים — אבל reasoning עדיין יכול לאכול
                  // את ה-budget. לכן יש לנו גם chain נוסף ל-non-reasoning.
                  openai: { reasoningEffort: 'minimal' },
                },
              }
            : {}),
          ...(options.presencePenalty != null
            ? { presencePenalty: options.presencePenalty }
            : {}),
          ...(options.frequencyPenalty != null
            ? { frequencyPenalty: options.frequencyPenalty }
            : {}),
          messages: options.messages,
        });

        lastFinishReason = out.finishReason;
        const body = postProcessBody(out.text ?? '');

        if (body.length >= MIN_NOTIFY_BODY_CHARS) {
          return body;
        }

        const reason = `empty/short text (finishReason=${out.finishReason}, len=${body.length})`;
        errors.push(`${provider.label}#${attempt}: ${reason}`);
        // eslint-disable-next-line no-console
        console.warn('[empathy-notify] empty completion', {
          label: options.label,
          provider: provider.label,
          attempt,
          finishReason: out.finishReason,
          length: body.length,
          maxOutputTokens: attempt === 0
            ? attemptMaxTokens
            : Math.min(attemptMaxTokens + 200, 1600),
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        errors.push(`${provider.label}#${attempt}: ${msg}`);
        // eslint-disable-next-line no-console
        console.warn('[empathy-notify] provider attempt failed', {
          label: options.label,
          provider: provider.label,
          attempt,
          error: msg,
        });
      }
    }
  }

  const suffix = options.label ? ` (${options.label})` : '';
  const finishHint = lastFinishReason ? ` finish_reason=${lastFinishReason};` : '';
  throw new Error(
    `[empathy-notify] all providers failed${suffix};${finishHint} errors=${errors.join(' | ')}`
  );
}
