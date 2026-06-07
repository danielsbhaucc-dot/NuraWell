import type { SupabaseClient } from '@supabase/supabase-js';

import { openrouter } from './client';
import { buildUserContext } from './memory';
import { buildCoachingStylePromptBlock } from './almog-coaching-style';
import { formatUserProgressForAi } from './format-user-progress-for-ai';
import {
  buildAdminUserJourneyReport,
  type AdminUserJourneyReport,
  type AdminUserJourneyStepRow,
} from '../admin/build-user-journey-report';

export type AdaptiveNextStep = {
  step_id: string | null;
  step_number: number | null;
  step_title: string | null;
  /** למה דווקא הצעד הזה עכשיו — משפט ממוקד */
  headline: string;
  /** חיבור אישי בין הצעד לקושי/יעד של המשתמש */
  why: string;
  /** דחיפה רכה לפעולה — משפט אחד */
  nudge: string;
  /** הצעת התחייבות ריאלית מותאמת להיסטוריה */
  commitment_suggestion: string | null;
  /** מצב: מתחיל / ממשיך / חוזר אחרי היעדרות / סיים הכל */
  pace: 'start' | 'continue' | 'return' | 'complete';
};

export type AdaptiveNextStepResult = {
  recommendation: AdaptiveNextStep;
  used_fallback: boolean;
  model: string | null;
};

const ADAPTIVE_MODEL = 'openai/gpt-5-mini';

const ADAPTIVE_SYSTEM_PROMPT = `אתה אלמוג — מנטור הליווי של NuraWell. אתה בוחר ומסגר את "הצעד הבא במסע" של המשתמש בצורה אישית, לא רצף קבוע לכולם.
תקבל את הצעד הבא שכבר נבחר (דטרמיניסטית), את ההיסטוריה והקשר של המשתמש. המשימה: למסגר את הצעד הזה בצורה שמדברת *אליו* — לחבר אותו לקושי/יעד שלו, ולהציע התחייבות ריאלית לפי ההתנהגות בפועל.

החזר JSON בלבד:
{
  "headline": "שורה אחת קצרה — למה דווקא הצעד הזה עכשיו (עד 8 מילים)",
  "why": "1-2 משפטים שמחברים את הצעד לקושי/יעד האישי של המשתמש. ספציפי, חם, בלי שפת מערכת.",
  "nudge": "משפט דחיפה רך אחד לפעולה — מזמין, לא לוחץ ולא מאשים.",
  "commitment_suggestion": "הצעת התחייבות ריאלית אחת לפי הדפוסים שלו (לדוגמה: אם נופל בערבים — התחייבות לבקרים בלבד). null אם אין מספיק מידע."
}

כללים:
- אם המשתמש נופל בזמן מסוים ביום → הצע התחייבות שמתחמקת מהזמן הקשה.
- אם יש רצף חזק → רכוב על המומנטום.
- אם חזר אחרי היעדרות → רך, בלי "התחלת מחדש", צעד קטן.
- בלי שפת מערכת ("השלם", "תזכורת", "סימנתי"). חם, אנושי, כמו חבר.
- אל תמציא תוכן של הצעד עצמו — רק מסגר אותו ביחס למשתמש.`;

function pickNextStep(report: AdminUserJourneyReport): {
  step: AdminUserJourneyStepRow | null;
  pace: AdaptiveNextStep['pace'];
} {
  const published = report.steps
    .filter((s) => s.is_published)
    .sort((a, b) => a.step_number - b.step_number);

  if (published.length === 0) return { step: null, pace: 'start' };

  const inProgress = published.find((s) => s.started && !s.is_completed);
  if (inProgress) return { step: inProgress, pace: 'continue' };

  const nextNew = published.find((s) => !s.is_completed);
  if (!nextNew) return { step: null, pace: 'complete' };

  const anyStarted = published.some((s) => s.started || s.is_completed);
  return { step: nextNew, pace: anyStarted ? 'continue' : 'start' };
}

function buildFallback(
  step: AdminUserJourneyStepRow | null,
  pace: AdaptiveNextStep['pace']
): AdaptiveNextStep {
  if (!step || pace === 'complete') {
    return {
      step_id: null,
      step_number: null,
      step_title: null,
      headline: 'סיימת את כל מה שפתוח 🎯',
      why: 'עברת את כל הצעדים הזמינים — זה הישג אמיתי. נמשיך כשייפתחו צעדים חדשים.',
      nudge: 'בינתיים, בוא נשמור על ההרגלים שכבר בנית.',
      commitment_suggestion: null,
      pace: 'complete',
    };
  }

  return {
    step_id: step.id,
    step_number: step.step_number,
    step_title: step.title,
    headline: pace === 'return' ? 'בוא נחזור בעדינות' : `הצעד הבא: ${step.title}`,
    why:
      pace === 'start'
        ? 'זה הצעד הראשון שלך במסע — קטן וברור, בלי לחץ.'
        : 'זה הצעד הבא שמחכה לך. צעד אחד קדימה, בקצב שלך.',
    nudge: 'בא לך לפתוח אותו עכשיו? אני איתך.',
    commitment_suggestion: null,
    pace,
  };
}

export async function buildAdaptiveNextStep(params: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient | any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient | any;
  userId: string;
}): Promise<AdaptiveNextStepResult> {
  const { supabase, admin, userId } = params;

  const [contextResult, report] = await Promise.all([
    buildUserContext(supabase, userId).catch(() => null),
    buildAdminUserJourneyReport(admin, userId).catch(() => null),
  ]);

  if (!report) {
    return {
      recommendation: buildFallback(null, 'start'),
      used_fallback: true,
      model: null,
    };
  }

  const { step, pace: rawPace } = pickNextStep(report);
  const daysSinceLastActive = contextResult?.raw.daysSinceLastActive ?? null;
  const pace: AdaptiveNextStep['pace'] =
    rawPace === 'continue' && daysSinceLastActive !== null && daysSinceLastActive >= 3
      ? 'return'
      : rawPace;

  const fallback = buildFallback(step, pace);

  if (!step || pace === 'complete' || !process.env.OPENROUTER_API_KEY?.trim()) {
    return { recommendation: fallback, used_fallback: true, model: null };
  }

  const aiContext = contextResult?.raw.aiContext ?? null;
  const coachingBlock = buildCoachingStylePromptBlock(aiContext);
  const progressText = formatUserProgressForAi(report);

  const userContent = [
    `הצעד הבא שנבחר: צעד ${step.step_number} — "${step.title}"`,
    `מצב קצב: ${pace}`,
    daysSinceLastActive !== null ? `ימים מאז כניסה אחרונה: ${daysSinceLastActive}` : null,
    contextResult ? contextResult.contextString : null,
    coachingBlock || null,
    progressText || null,
  ]
    .filter(Boolean)
    .join('\n\n');

  try {
    const completion = await openrouter.chat.completions.create({
      model: ADAPTIVE_MODEL,
      temperature: 0.7,
      max_tokens: 500,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: ADAPTIVE_SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
    });

    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}') as Record<
      string,
      unknown
    >;

    const headline = typeof parsed.headline === 'string' ? parsed.headline.trim() : '';
    const why = typeof parsed.why === 'string' ? parsed.why.trim() : '';
    if (!headline || !why) {
      return { recommendation: fallback, used_fallback: true, model: ADAPTIVE_MODEL };
    }

    const commitment =
      typeof parsed.commitment_suggestion === 'string' &&
      parsed.commitment_suggestion.trim() &&
      parsed.commitment_suggestion.trim().toLowerCase() !== 'null'
        ? parsed.commitment_suggestion.trim()
        : null;

    return {
      recommendation: {
        step_id: step.id,
        step_number: step.step_number,
        step_title: step.title,
        headline: headline.slice(0, 80),
        why: why.slice(0, 280),
        nudge:
          (typeof parsed.nudge === 'string' ? parsed.nudge.trim() : '').slice(0, 160) ||
          fallback.nudge,
        commitment_suggestion: commitment,
        pace,
      },
      used_fallback: false,
      model: ADAPTIVE_MODEL,
    };
  } catch (error) {
    console.error('[journey-adaptive-llm] generation failed', error);
    return { recommendation: fallback, used_fallback: true, model: ADAPTIVE_MODEL };
  }
}
