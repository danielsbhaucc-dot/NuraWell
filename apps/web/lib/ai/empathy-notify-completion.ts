import { createAiProvider } from '@/lib/ai/provider-factory';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, type ModelMessage } from 'ai';
import { splitSystemMessages } from './split-system-messages';

import { AI_MODELS } from './client';
import {
  groqCompatFetch,
  groqLaneUsesDirectGroq,
  groqLaneApiKey,
  groqLaneBaseUrl,
  isGroqLaneAvailable,
} from './groq-compat';
import { ALMOG_NOTIFY_MAX_OUTPUT_TOKENS } from './prompts';
import { stripReasoningArtifacts, validateNotifyText } from '../notifications/validate-notify-text';
import type { NotifyGender } from '../notifications/notify-hebrew-lint';
import { qcNotifyText } from '../notifications/notify-qc';
import {
  applyAutoFixRules,
  categoryFromReason,
  loadActiveStyleRules,
  logNotifyQualityEvents,
  styleRulesPromptBlock,
  type NotifyQualityEvent,
} from '../notifications/quality-learning';

/**
 * 📣 מנוע יצירת טקסט להתראות אלמוג.
 *
 * 🎯 עיקרון הליבה (הוחלף ב-2026-05-31): *אין fallback סטטי*. אם כל ה-LLM
 * providers נכשלים — זורקים שגיאה. צרכן שיודע שזו התראה לא יכניס שום
 * רשומה ל-DB (וה-user לא יקבל push). עדיף שקט מהודעה רובוטית.
 *
 * ⚙️ Provider chain (לפי סדר אמינות לנוטיפיקציות אנושיות):
 *   1. `meta-llama/llama-4-scout` — דרך OpenRouter. *מודל ראשי*. מהיר, זול,
 *                                עברית טבעית, בלי reasoning tokens שאוכלים
 *                                את ה-output budget.
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
/** per-attempt cap so a hung provider can't burn the function's maxDuration */
const NOTIFY_AI_TIMEOUT_MS = 20_000;
/** prevents 'קיבלתי את ההודעה שלך' hallucinations and third-person addressing */
export const NOTIFY_DIRECT_ADDRESS_RULE =
  'חשוב: ההקשר למעלה מתאר את *הנמען עצמו*. ההודעה נשלחת אליו ישירות — פנה אליו בגוף שני ("איך הלך לך…"), לעולם לא עליו בגוף שלישי ("הוא לא דיווח", "לעזור לו") ולא למישהו אחר. אם פונים בשם — רק בשם הנמען שמופיע בהקשר, אף פעם לא בשם אחר. זו הודעה יזומה ממך — הוא לא שלח לך כלום עכשיו: אסור "קיבלתי את ההודעה/העדכון", "תודה ששיתפת", ואסור להמציא אירועים, נתונים או שיחות שלא מופיעים בהקשר.';
const MAX_BODY_CHARS = 320;

type EmpathyNotifyCompletionOptions = {
  messages: ModelMessage[];
  maxTokens?: number;
  temperature?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  label?: string;
  /**
   * שם פרטי לניקוי פתיחת גוף ההודעה. הכותרת כבר פונה בשם, לכן גוף שמתחיל
   * שוב בשם נראה כפול בכרטיס ההתראה.
   */
  recipientFirstName?: string;
  /** enables gender checks in the deterministic gate + the LLM editor */
  recipientGender?: NotifyGender;
  /** for usage metering of the editor pass */
  userId?: string | null;
};

const openrouterAi = createAiProvider({ apiKey: process.env.OPENROUTER_API_KEY ?? '' });

/**
 * מזריק את שדה ה-`provider` של OpenRouter כדי לנתב את מודל הנוטיפיקציות הראשי
 * (DeepSeek V4 Flash) דרך **DeepInfra** — הספק שנבחר לניסוח ההתראות.
 * `allow_fallbacks: true` כדי שלעולם לא ניפול לשקט אם DeepInfra לא זמין רגעית.
 */
const routePrimaryToDeepInfra: typeof fetch = async (input, init) => {
  // gpt-oss (default): Groq-preferred + low reasoning + token headroom (groq-compat.ts)
  if (init && typeof init.body === 'string' && /gpt-oss/i.test(init.body.slice(0, 300))) {
    return groqCompatFetch(input, init);
  }
  if (init && typeof init.body === 'string') {
    try {
      const json = JSON.parse(init.body) as Record<string, unknown>;
      json.provider = { order: ['deepinfra'], allow_fallbacks: true };
      // reasoning models (DeepSeek V4 Flash): keep thinking short and OUT of `content`
      // (leaked reasoning / budget exhaustion = truncated or nonsense notifications).
      if (looksLikeReasoningModel(String(json.model ?? '')) && json.reasoning == null) {
        json.reasoning = { effort: 'low', exclude: true };
      }
      init = { ...init, body: JSON.stringify(json) };
    } catch {
      /* גוף שאינו JSON — משאירים כמו שהוא */
    }
  }
  return fetch(input, init);
};

/** OpenRouter עם ניתוב מועדף ל-DeepInfra — רק למודל הנוטיפיקציות הראשי. */
const openrouterPrimaryAi = createAiProvider({ apiKey: process.env.OPENROUTER_API_KEY ?? '', fetch: routePrimaryToDeepInfra });

/** זיהוי מודלי reasoning — דורשים budget גדול יותר ל-text הסופי. */
function looksLikeReasoningModel(model: string): boolean {
  return /gpt-5|deepseek-v4|deepseek-r|deepseek-reasoner|nemotron|glm-4\.\d|minimax-m\d|kimi-k2|mimo|reasoning|thinking|o1|o3|o4/i.test(
    model
  );
}

const groqAi = createAiProvider({ apiKey: groqLaneApiKey(), baseURL: groqLaneBaseUrl(), fetch: groqCompatFetch });

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
  process.env.NOTIFICATION_EMPATHY_MODEL?.trim() || 'openai/gpt-oss-120b';

function notifyProviders(): NotifyProvider[] {
  const providers: NotifyProvider[] = [];

  if (process.env.OPENROUTER_API_KEY?.trim()) {
    providers.push({
      label: 'openrouter-primary',
      model: NOTIFICATION_PRIMARY_MODEL,
      // המודל הראשי מנותב דרך DeepInfra (ראה openrouterPrimaryAi).
      chat: openrouterPrimaryAi,
      attempts: 2,
      isReasoningModel: looksLikeReasoningModel(NOTIFICATION_PRIMARY_MODEL),
    });

    if (AI_MODELS.empathy !== NOTIFICATION_PRIMARY_MODEL) {
      providers.push({
        label: 'openrouter-secondary',
        model: AI_MODELS.empathy,
        // ה-fallback (gpt-5-mini) נשאר בניתוב רגיל של OpenRouter — DeepInfra לא מארח אותו.
        chat: openrouterAi,
        attempts: 1,
        isReasoningModel: looksLikeReasoningModel(AI_MODELS.empathy),
      });
    }
  }

  const groqDuplicatesPrimary =
    AI_MODELS.background_groq_strong === NOTIFICATION_PRIMARY_MODEL && !groqLaneUsesDirectGroq();
  if (isGroqLaneAvailable() && !groqDuplicatesPrimary) {
    providers.push({
      label: 'groq',
      model: AI_MODELS.background_groq_strong,
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
    // מודלי reasoning (DeepSeek V4 Flash, GPT-5 mini) מקצים טוקנים פנימיים
    // ל-reasoning — צריך budget גדול דיו ש-text הסופי לא ייצא ריק
    // (זה השורש של "Empty empathy model output"). עם reasoningEffort=minimal זה בטוח.
    return Math.max(requested, 1500);
  }
  // gpt-4o-mini / Llama / etc — אין reasoning, output מגיע מיד.
  // 250 תווים בעברית ≈ 120-150 טוקנים. נשאיר רוחב כדי לא להיחתך.
  return Math.max(requested, 220);
}

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

function postProcessBody(raw: string, firstName?: string): string {
  let cleaned = stripReasoningArtifacts(raw);
  if (!cleaned) return '';
  // הסרת גרשיים פותחים/סוגרים שהמודל לפעמים מוסיף
  cleaned = cleaned.replace(/^["'״׳`]+|["'״׳`]+$/g, '').trim();
  // איחוד שורות מרובות לרווח אחד (push notification = שורה אחת)
  cleaned = cleaned.replace(/\s*\n+\s*/g, ' ').trim();
  cleaned = stripLeadingRecipientName(cleaned, firstName);
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

  // learned "avoid X → say Y" rules (nightly, capped, reviewable in Ops) — injected into the prompt
  let admin: import('@supabase/supabase-js').SupabaseClient | null = null;
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    admin = createAdminClient();
  } catch {
    admin = null;
  }
  const styleRules = await loadActiveStyleRules(admin);
  const styleBlock = styleRulesPromptBlock(styleRules);
  const qualityEvents: NotifyQualityEvent[] = [];
  const flushEvents = () =>
    void logNotifyQualityEvents(qualityEvents.splice(0), { firstName: options.recipientFirstName, admin });

  const providers = notifyProviders();
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
        /** retries go *cooler* (high temperature was a source of gibberish), capped at 0.9 */
        const tempForAttempt = Math.max(0.4, Math.min(0.9, temperature) - attempt * 0.15);

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
          abortSignal: AbortSignal.timeout(NOTIFY_AI_TIMEOUT_MS),
          ...splitSystemMessages([
            ...options.messages,
            { role: 'system', content: NOTIFY_DIRECT_ADDRESS_RULE },
            ...(styleBlock ? [{ role: 'system' as const, content: styleBlock }] : []),
          ]),
        });

        lastFinishReason = out.finishReason;
        const body = postProcessBody(out.text ?? '', options.recipientFirstName);
        const checked = validateNotifyText(body, {
          finishReason: out.finishReason,
          maxChars: MAX_BODY_CHARS,
          minChars: MIN_NOTIFY_BODY_CHARS,
          firstName: options.recipientFirstName,
          gender: options.recipientGender,
        });
        if (checked.ok) {
          if (checked.fixes?.length) {
            qualityEvents.push({ stage: 'lint_fix', category: checked.fixes[0]!, source: options.label, before: body, after: checked.text });
          }
          const learned = applyAutoFixRules(checked.text, styleRules);
          if (learned.applied.length) {
            qualityEvents.push({ stage: 'lint_fix', category: 'learned_rule', source: options.label, before: checked.text, after: learned.text });
          }
          // second line of defence: cheap LLM copy-edit before the text is stored/pushed (fail-open)
          const qc = await qcNotifyText(learned.text, {
            firstName: options.recipientFirstName,
            gender: options.recipientGender,
            userId: options.userId ?? null,
            admin,
          });
          if (qc.status === 'edited') {
            qualityEvents.push({ stage: 'qc_edit', category: 'llm_edit', source: options.label, before: learned.text, after: qc.text });
          } else if (qc.status === 'rejected') {
            qualityEvents.push({ stage: 'qc_reject', category: 'llm_fix_rejected', source: options.label, before: learned.text });
          }
          flushEvents();
          return qc.text;
        }
        if (body) {
          qualityEvents.push({ stage: 'lint_reject', category: categoryFromReason(checked.reason), source: options.label, before: body });
        }

        const reason = `${checked.reason} (finishReason=${out.finishReason}, len=${body.length})`;
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

  flushEvents();
  const suffix = options.label ? ` (${options.label})` : '';
  const finishHint = lastFinishReason ? ` finish_reason=${lastFinishReason};` : '';
  throw new Error(
    `[empathy-notify] all providers failed${suffix};${finishHint} errors=${errors.join(' | ')}`
  );
}
