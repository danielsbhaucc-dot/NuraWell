import type { SupabaseClient } from '@supabase/supabase-js';

import { openrouter } from './client';
import { buildUserContext } from './memory';
import { buildCoachingStylePromptBlock } from './almog-coaching-style';
import { formatUserProgressForAi } from './format-user-progress-for-ai';
import { buildAdminUserJourneyReport } from '../admin/build-user-journey-report';
import {
  loadJourneyAccessContext,
  pickNextJourneyStep,
  type PickNextJourneyStepResult,
} from '../journey/journey-access';
import type { MainObstacle, WeakestTimeOfDay } from '../onboarding/types';

export type AdaptiveNextStep = {
  step_id: string | null;
  step_number: number | null;
  step_title: string | null;
  headline: string;
  why: string;
  nudge: string;
  commitment_suggestion: string | null;
  pace: 'start' | 'continue' | 'return' | 'complete';
  phase: PickNextJourneyStepResult['phase'];
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

function buildFallback(
  pick: PickNextJourneyStepResult
): AdaptiveNextStep {
  const { step, pace } = pick;
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
      phase: pick.phase,
    };
  }

  return {
    step_id: step.id,
    step_number: step.step_number,
    step_title: step.title,
    headline:
      pace === 'return'
        ? 'בוא נחזור בעדינות'
        : pick.phase === 'foundation'
          ? `הצעד הבא: ${step.title}`
          : `נבחר עבורך: ${step.title}`,
    why:
      pace === 'start' && pick.phase === 'foundation'
        ? 'זה הצעד הראשון שלך במסע — קטן וברור, בלי לחץ.'
        : pick.phase === 'adaptive'
          ? 'בחרתי את השיעור הזה כי הוא מתאים למה שכבר למדתי עליך — בקצב שלך.'
          : 'זה הצעד הבא שמחכה לך. צעד אחד קדימה, בקצב שלך.',
    nudge: 'בא לך לפתוח אותו עכשיו? אני איתך.',
    commitment_suggestion: null,
    pace,
    phase: pick.phase,
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

  const [contextResult, report, profileRow] = await Promise.all([
    buildUserContext(supabase, userId).catch(() => null),
    buildAdminUserJourneyReport(admin, userId).catch(() => null),
    supabase
      .from('profiles')
      .select('main_obstacle, main_obstacle_detail, weakest_time_of_day')
      .eq('id', userId)
      .maybeSingle(),
  ]);

  if (!report) {
    return {
      recommendation: buildFallback({ step: null, pace: 'start', phase: 'legacy' }),
      used_fallback: true,
      model: null,
    };
  }

  const ctx = await loadJourneyAccessContext(supabase, userId, report);
  const profile = profileRow as {
    main_obstacle?: string | null;
    main_obstacle_detail?: string | null;
    weakest_time_of_day?: string | null;
  } | null;

  const pick = await pickNextJourneyStep({
    report,
    ctx,
    admin,
    userId,
    daysSinceLastActive: contextResult?.raw.daysSinceLastActive ?? null,
    signals: {
      main_obstacle: (profile?.main_obstacle as MainObstacle | null) ?? null,
      main_obstacle_detail: profile?.main_obstacle_detail ?? null,
      weakest_time_of_day:
        (profile?.weakest_time_of_day as WeakestTimeOfDay | null) ?? null,
    },
  });

  const { step, pace: rawPace } = pick;
  const daysSinceLastActive = contextResult?.raw.daysSinceLastActive ?? null;
  const pace: AdaptiveNextStep['pace'] =
    rawPace === 'continue' && daysSinceLastActive !== null && daysSinceLastActive >= 3
      ? 'return'
      : rawPace;

  const fallback = buildFallback({ ...pick, pace });

  if (!step || pace === 'complete' || !process.env.OPENROUTER_API_KEY?.trim()) {
    return { recommendation: fallback, used_fallback: true, model: null };
  }

  const aiContext = contextResult?.raw.aiContext ?? null;
  const coachingBlock = buildCoachingStylePromptBlock(aiContext);
  const progressText = formatUserProgressForAi(report);

  const userContent = [
    `שלב מסע: ${pick.phase}`,
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
        phase: pick.phase,
      },
      used_fallback: false,
      model: ADAPTIVE_MODEL,
    };
  } catch (error) {
    console.error('[journey-adaptive-llm] generation failed', error);
    return { recommendation: fallback, used_fallback: true, model: ADAPTIVE_MODEL };
  }
}
