/**
 * LLM client + prompts ל-Periodic Summary engine.
 *
 * • ברירת מחדל: `AI_MODELS.empathy` (gpt-5-mini דרך OpenRouter).
 * • Override ב-env: `SUMMARY_ENGINE_MODEL`.
 * • Fallback: אם OpenRouter נכשל — `AI_MODELS.background_groq` (Llama 4
 *   דרך Groq) כדי לא לחסום את ה-cron כשהספק העליון down.
 *
 * הפלט הוא טקסט בעברית, אמפתי, חם, בלי שיפוטיות, עם מטריקות מוטבעות
 * רק בעדינות (לא טבלה — אלא משפט הקשרי).
 */

import type OpenAI from 'openai';
import { AI_MODELS, getClientForModel } from '../../ai/client';
import type { SummaryType } from './period-keys';
import type { SummaryMetrics } from './metrics';

const SUMMARY_PRIMARY_MODEL =
  process.env.SUMMARY_ENGINE_MODEL?.trim() || AI_MODELS.empathy;

// Fallback ספק שונה לחלוטין — Llama 4 Scout דרך Groq.
const SUMMARY_FALLBACK_MODEL = AI_MODELS.background_groq;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ─── Prompts ───────────────────────────────────────────────────

const COACH_PERSONA = `אתה "אלמוג" — מאמן בריאות אישי של אפליקציית NuraWell. אתה כותב בעברית, חם, אנושי, אופטימי, נטול שיפוט. אתה מודע לכך שמשתמשים נופלים ולא קורה כלום — תפקידך לחזק, לעודד, ולהבליט את ההישגים האמיתיים בלי לחנף ובלי "טיפים גנריים".`;

/**
 * חוק ה-rollup: ברמות מעל יומי, אתה לא חוזה את הנתונים — אתה מקבל אותם
 * כבר מסונתזים מתובנות הרמה התחתונה. תפקידך *להתבונן בתבנית* בין הילדים
 * (Trend, חוזק, החמצה חוזרת) ולספר עליה — לא לסכם כל ילד בנפרד.
 */
const ROLLUP_DIRECTIVE = `אתה מקבל למטה רשימה של "תובנות-ילדים" — סיכומים שכבר נכתבו ברמה התחתונה. אתה לא ממציא מספרים ולא ממציא ימים. במקום זה: זהה תבנית רוחבית בין הילדים (מומנטום עולה / יורד, הישג חוזר, יום חלש שחוזר על עצמו, רבעון/שבוע שהוביל) — וספר את הסיפור הזה במשפט/ים. אל תזכיר את המילה "סיכום" או "תובנה". דבר אל המשתמש בגוף שני — כאילו אתה אומר לו את זה במפגש.`;

const FORMAT_RULES_BY_TYPE: Record<SummaryType, string> = {
  daily: `אורך: 1–2 משפטים, עד ~30 מילים. אימוג'י אחד אופציונלי. בלי הקדמות ובלי כותרות. רגע קצר של רפלקציה על היום הזה בלבד.`,
  weekly: `אורך: 2–3 משפטים, עד ~60 מילים. סנתז את 7 התובנות היומיות: 1 הישג אמיתי שחוזר + 1 דבר ללמוד. אימוג'י אחד אופציונלי. בלי הקדמות.`,
  monthly: `אורך: 3–4 משפטים, עד ~90 מילים. רולאפ מ-4 התובנות השבועיות: זהה מגמה ברורה לאורך החודש, נקודת מפנה אם הייתה, ויום-בשבוע "חלש" אם בולט בכמה שבועות. אימוג'י אחד אופציונלי.`,
  quarterly: `אורך: 4–5 משפטים, עד ~120 מילים. רולאפ מ-3 התובנות החודשיות: כותרת רבעונית קצרה במשפט הראשון, ואז קצב כללי + מהפך / יציבות / ירידה ביחס לחודשים שמרכיבים את הרבעון.`,
  semi_annual: `אורך: 5–6 משפטים, עד ~150 מילים. רולאפ מ-2 התובנות הרבעוניות: ספר את הקשת בין הרבעונים — איזה הוביל, איזה התרסק או החזיק יציב, ולמה זה משמעותי לטווח השנתי שמתפתח.`,
  annual: `אורך: 6–8 משפטים, עד ~200 מילים. רולאפ מ-2 התובנות החצי-שנתיות: ספר את "סיפור השנה" ב-3 קטעים — התחלה, מהפך, סיכום. הזכר מספר מובהק אחד מהמטריקות (completion_rate או max_streak). סיים במשפט מעורר השראה לשנה הבאה.`,
};

const TYPE_LABEL_HE: Record<SummaryType, string> = {
  daily: 'יומי',
  weekly: 'שבועי',
  monthly: 'חודשי',
  quarterly: 'רבעוני',
  semi_annual: 'חצי-שנתי',
  annual: 'שנתי',
};

export interface BuildPromptInput {
  type: SummaryType;
  periodKey: string;
  /** שם פרטי לפנייה אישית. */
  firstName: string;
  metrics: SummaryMetrics;
  /**
   * סיכומי הילדים מרמה אחת מתחת — מועברים ל-LLM כשרשרת תובנות.
   * ב-daily זה ריק (העלה).
   */
  childInsights?: Array<{ periodKey: string; insight: string }>;
}

function buildSystemPrompt(type: SummaryType, isRollup: boolean): string {
  const parts: string[] = [
    COACH_PERSONA,
    '',
    `כתוב סיכום ${TYPE_LABEL_HE[type]} (${type}).`,
    FORMAT_RULES_BY_TYPE[type],
  ];
  if (isRollup) {
    parts.push('', ROLLUP_DIRECTIVE);
  }
  return parts.join('\n');
}

function buildUserMessage(input: BuildPromptInput): string {
  const { type, periodKey, firstName, metrics, childInsights } = input;
  const lines: string[] = [];
  lines.push(`משתמש: ${firstName}`);
  lines.push(`תקופה: ${TYPE_LABEL_HE[type]} — ${periodKey}`);
  lines.push('');
  lines.push('מתמטיקה דטרמיניסטית מה-DB (אל תמציא מספרים אחרים):');
  lines.push(JSON.stringify(metrics, null, 2));

  // ה"בשר" של ה-rollup: התובנות של הרמה התחתונה. בעברית מודגש שזה הקלט
  // היחיד שעליו צריך להתבסס לסיפור-המסע (המספרים הם רק ריפרנס סטטי).
  if (childInsights && childInsights.length > 0) {
    lines.push('');
    lines.push(`📚 תובנות הרמה התחתונה (${childInsights.length} ילדים) — זה הקלט שעליו אתה מבצע rollup:`);
    for (const child of childInsights) {
      const safe = child.insight.trim().replace(/\s+/g, ' ');
      if (!safe) continue;
      lines.push(`  • [${child.periodKey}] ${safe}`);
    }
    lines.push('');
    lines.push('זהה את החוט המקשר ביניהן — אל תסכם כל אחת בנפרד, ואל תזכיר תאריכים פנימיים.');
  }

  lines.push('');
  lines.push(
    'החזר רק את הסיכום עצמו — בעברית, בלי גרשיים מסביב, בלי הקדמות, בלי כותרות.'
  );
  return lines.join('\n');
}

// ─── LLM call w/ fallback chain ────────────────────────────────

interface CallStep {
  label: string;
  resolveClient: () => OpenAI;
  model: string;
  timeoutMs: number;
  attempts: number;
}

export interface SummaryLlmResult {
  insight: string;
  model: string;
  usedFallback: boolean;
  attempts: number;
  errors: string[];
}

function buildChain(modelOverride?: string): CallStep[] {
  const primary = modelOverride ?? SUMMARY_PRIMARY_MODEL;
  return [
    {
      label: 'openrouter-primary',
      resolveClient: () => getClientForModel('empathy'),
      model: primary,
      timeoutMs: 25_000,
      attempts: 2,
    },
    {
      label: 'groq-fallback',
      resolveClient: () => getClientForModel('background_groq'),
      model: SUMMARY_FALLBACK_MODEL,
      timeoutMs: 15_000,
      attempts: 1,
    },
  ];
}

function postProcess(text: string): string {
  let cleaned = (text ?? '').trim();
  cleaned = cleaned.replace(/^["'״׳`]+|["'״׳`]+$/g, '').trim();
  if (!cleaned) return '';
  return cleaned;
}

async function callOnce(
  client: OpenAI,
  model: string,
  systemPrompt: string,
  userMessage: string,
  timeoutMs: number
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const completion = await client.chat.completions.create(
      {
        model,
        temperature: 0.7,
        max_tokens: 700,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
      },
      { signal: controller.signal }
    );
    const raw = completion.choices?.[0]?.message?.content ?? '';
    const cleaned = postProcess(raw);
    if (!cleaned) throw new Error('empty_or_invalid_response');
    return cleaned;
  } finally {
    clearTimeout(timer);
  }
}

export interface GenerateSummaryInsightOptions {
  /** Override של המודל הראשי. ה-fallback ל-Groq נשאר כמו שהוא. */
  model?: string;
}

/**
 * מפיק את `ai_insight` עבור תקופה נתונה. מטפל ב-retry + cross-provider
 * fallback ומחזיר תמיד טקסט (במקרה הקיצון יקבל template סטטי).
 */
export async function generateSummaryInsight(
  input: BuildPromptInput,
  options: GenerateSummaryInsightOptions = {}
): Promise<SummaryLlmResult> {
  // rollup = יש לפחות תובנת-ילד אחת לא ריקה. ב-daily זה תמיד false.
  const isRollup = (input.childInsights ?? []).some(
    (c) => c.insight && c.insight.trim().length > 0
  );
  const systemPrompt = buildSystemPrompt(input.type, isRollup);
  const userMessage = buildUserMessage(input);

  const chain = buildChain(options.model);
  const errors: string[] = [];
  let attemptCount = 0;

  for (const step of chain) {
    for (let i = 1; i <= step.attempts; i += 1) {
      attemptCount += 1;
      try {
        const client = step.resolveClient();
        const insight = await callOnce(
          client,
          step.model,
          systemPrompt,
          userMessage,
          step.timeoutMs
        );
        return {
          insight,
          model: step.model,
          usedFallback: step.label !== 'openrouter-primary',
          attempts: attemptCount,
          errors,
        };
      } catch (err) {
        const msg =
          err instanceof Error ? `${step.label}#${i}: ${err.message}` : `${step.label}#${i}`;
        errors.push(msg);
        // eslint-disable-next-line no-console
        console.warn('[summary-engine] LLM attempt failed:', msg);
        if (i < step.attempts) {
          await sleep(300 * i);
        }
      }
    }
  }

  // Hard fallback סטטי — לא אמור לקרות בפרודקשן עם שני ספקים שונים.
  const fallbackInsight = buildStaticFallback(input);
  // eslint-disable-next-line no-console
  console.error(
    '[summary-engine] All LLM providers failed, using static template:',
    errors
  );
  return {
    insight: fallbackInsight,
    model: 'static-template',
    usedFallback: true,
    attempts: attemptCount,
    errors,
  };
}

/** Template מינימלי כשגם OpenRouter וגם Groq נופלים — כדי לא לאחסן `ai_insight=''`. */
function buildStaticFallback(input: BuildPromptInput): string {
  const { type, periodKey, firstName, metrics } = input;
  const rate = Math.round((metrics.completion_rate ?? 0) * 100);
  const label = TYPE_LABEL_HE[type];
  return `${firstName}, סיכום ${label} (${periodKey}): השלמת ${rate}% מהמשימות בתקופה הזאת. אנחנו ממשיכים מכאן יחד 💪`;
}
