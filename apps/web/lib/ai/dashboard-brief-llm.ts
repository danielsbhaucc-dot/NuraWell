import type { SupabaseClient } from '@supabase/supabase-js';

import { openrouter } from './client';
import { buildUserContext } from './memory';
import { fetchTodayChatTurns } from './almog-daily-context';
import { buildCoachingStylePromptBlock } from './almog-coaching-style';
import { formatUserProgressForAi } from './format-user-progress-for-ai';
import { buildAdminUserJourneyReport } from '../admin/build-user-journey-report';

/** פעולות שה-CTA האדפטיבי יכול להפעיל בקליינט. */
export type DashboardBriefCtaAction =
  | 'open_chat'
  | 'open_journey'
  | 'open_tasks'
  | 'open_progress'
  | 'open_courses';

/** הטון של התקציר — קובע צבע/אייקון בקליינט. */
export type DashboardBriefMood = 'celebrate' | 'encourage' | 'gentle' | 'neutral';

export type DashboardBrief = {
  /** שורת פתיחה קצרה ואישית */
  headline: string;
  /** 2-3 משפטים אישיים */
  body: string;
  /** טקסט הכפתור הראשי */
  cta_label: string;
  /** הפעולה שהכפתור מבצע */
  cta_action: DashboardBriefCtaAction;
  /** אם open_chat — משפט פתיחה לשיחה בגוף ראשון מנקודת מבט המשתמש */
  cta_prompt: string | null;
  mood: DashboardBriefMood;
};

export type DashboardBriefResult = {
  brief: DashboardBrief;
  used_fallback: boolean;
  model: string | null;
};

const BRIEF_MODEL = 'openai/gpt-5-mini';

const VALID_ACTIONS: DashboardBriefCtaAction[] = [
  'open_chat',
  'open_journey',
  'open_tasks',
  'open_progress',
  'open_courses',
];
const VALID_MOODS: DashboardBriefMood[] = ['celebrate', 'encourage', 'gentle', 'neutral'];

const BRIEF_SYSTEM_PROMPT = `אתה אלמוג — מנטור הליווי האישי של NuraWell. גבר, חבר אמיתי, עברית יומיומית וחמה, לא בוט ולא מערכת.
המשימה שלך כאן: לכתוב "תקציר חי" קצר שמופיע בראש מסך הבית של המשתמש בכל כניסה. זה לא צ'אט — זו הצצה אישית של אלמוג למה שחשוב למשתמש *עכשיו*, על סמך הנתונים שתקבל.

החזר JSON בלבד (בלי markdown, בלי טקסט מסביב) בפורמט הבא:
{
  "headline": "שורת פתיחה אישית קצרה מאוד — עד 5 מילים, בלי שם פרטי בסוף משפט מאולץ",
  "body": "2-3 משפטים אישיים, חמים וספציפיים בעברית. מבוססים אך ורק על הנתונים. משקפים מה קורה איתו ומדגישים מה הכי חשוב עכשיו. בלי שפת מערכת.",
  "cta_label": "טקסט כפתור קצר — 2-4 מילים, פעולה מזמינה",
  "cta_action": "open_chat | open_journey | open_tasks | open_progress | open_courses",
  "cta_prompt": "אם cta_action=open_chat — משפט פתיחה לשיחה שייכתב *מנקודת מבט המשתמש* (גוף ראשון), טבעי וקצר. אחרת null",
  "mood": "celebrate | encourage | gentle | neutral"
}

כללי תוכן (קריטי):
- ספציפי לנתונים, לא גנרי. אם יש רצף — חגוג אותו בשם; אם יש נפילה/היעדרות — חזור בעדינות בלי אשמה ובלי "ראיתי שלא".
- בלי שפת מערכת: לא "המערכת", לא "סימנתי", לא "השלמת משימה", לא "ראיתי שלא".
- בלי הטפה ובלי רשימות. חם, אנושי, כמו הודעת וואטסאפ מחבר.
- אם המשתמש לא היה פעיל כמה ימים → mood=gentle, cta_action=open_chat, CTA רכה ("בוא נחזור בעדינות").
- אם יש מומנטום/רצף חזק → mood=celebrate, אפשר cta_action=open_journey ("שמור על המומנטום").
- אם יש משימות פתוחות להיום → אפשר cta_action=open_tasks או open_chat.
- אם אין נתונים בכלל (משתמש חדש) → mood=neutral, פתיחה מזמינה למסע, cta_action=open_journey.
- התאם את הטון לסגנון הליווי המבוקש אם צוין.
- אל תמציא נתונים שלא מופיעים. אל תזכיר שזה "תקציר" או "נתונים".`;

function clampText(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.replace(/\s+/g, ' ').trim();
  return trimmed.length > max ? `${trimmed.slice(0, max).trim()}…` : trimmed;
}

function coerceAction(value: unknown): DashboardBriefCtaAction {
  return VALID_ACTIONS.includes(value as DashboardBriefCtaAction)
    ? (value as DashboardBriefCtaAction)
    : 'open_chat';
}

function coerceMood(value: unknown): DashboardBriefMood {
  return VALID_MOODS.includes(value as DashboardBriefMood)
    ? (value as DashboardBriefMood)
    : 'neutral';
}

/**
 * תקציר דטרמיניסטי — נכנס כש-LLM נכשל או חסר מפתח. עדיין אישי על בסיס האותות.
 */
function buildFallbackBrief(signals: BriefSignals, firstName: string): DashboardBrief {
  const name = firstName && firstName !== 'משתמש' ? firstName : '';

  if (signals.daysSinceLastActive !== null && signals.daysSinceLastActive >= 3) {
    return {
      headline: name ? `טוב לראות אותך${name ? `, ${name}` : ''}` : 'טוב לראות אותך',
      body: 'עבר קצת זמן — וזה ממש בסדר. בלי להתחיל הכל מחדש, רק לחזור בעדינות לקצב שלך. מה שלומך עכשיו?',
      cta_label: 'בוא נדבר רגע',
      cta_action: 'open_chat',
      cta_prompt: 'היי אלמוג, עבר קצת זמן. בוא נחזור בעדינות.',
      mood: 'gentle',
    };
  }

  if (signals.activeDaysLast7 >= 4) {
    return {
      headline: 'יש לך מומנטום 🔥',
      body: `${signals.activeDaysLast7} מתוך 7 הימים האחרונים היית בפעולה — זה בדיוק מה שמזיז את המחט. בוא נשמור על הקצב היפה הזה.`,
      cta_label: 'המשך במסע',
      cta_action: 'open_journey',
      cta_prompt: null,
      mood: 'celebrate',
    };
  }

  if (signals.openTasksToday > 0) {
    return {
      headline: 'יש משהו קטן להיום',
      body: `נשארו לך ${signals.openTasksToday} צעדים קטנים להיום. לא חייבים הכל — אפילו אחד מזיז קדימה. ספר לי כשעשית.`,
      cta_label: 'עדכון משימות',
      cta_action: 'open_tasks',
      cta_prompt: null,
      mood: 'encourage',
    };
  }

  if (!signals.hasAnyProgress) {
    return {
      headline: 'מתחילים את המסע',
      body: 'כיף שאתה כאן 🌿 בוא נצא לצעד הראשון — קטן וברור, בלי לחץ. אני איתך לאורך כל הדרך.',
      cta_label: 'למסע שלי',
      cta_action: 'open_journey',
      cta_prompt: null,
      mood: 'neutral',
    };
  }

  return {
    headline: name ? `${name}, אני כאן` : 'אני כאן איתך',
    body: 'יום חדש, הזדמנות נקייה. בוא נבחר דבר אחד קטן שמרגיש לך נכון עכשיו ונתחיל ממנו.',
    cta_label: 'מה הכי חשוב היום?',
    cta_action: 'open_chat',
    cta_prompt: 'היי אלמוג, מה הכי כדאי לי להתמקד בו היום?',
    mood: 'encourage',
  };
}

type BriefSignals = {
  daysSinceLastActive: number | null;
  weeklyCompleted: number;
  activeDaysLast7: number;
  openTasksToday: number;
  hasAnyProgress: boolean;
};

/**
 * בונה תקציר אישי חי לראש מסך הבית.
 * מקבל supabase מסוג user (RLS) לזיכרון/צ'אט ו-admin (service role) לדו"ח המסע.
 */
export async function buildDashboardBrief(params: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient | any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient | any;
  userId: string;
  firstName: string;
}): Promise<DashboardBriefResult> {
  const { supabase, admin, userId, firstName } = params;

  const [contextResult, chatTurns, report] = await Promise.all([
    buildUserContext(supabase, userId).catch(() => null),
    fetchTodayChatTurns(supabase, userId).catch(() => []),
    buildAdminUserJourneyReport(admin, userId).catch(() => null),
  ]);

  const aiContext = contextResult?.raw.aiContext ?? null;
  const weeklyCompleted = contextResult?.raw.weeklyCompleted ?? 0;
  const daysSinceLastActive = contextResult?.raw.daysSinceLastActive ?? null;

  let activeDaysLast7 = 0;
  let openTasksToday = 0;
  let hasAnyProgress = false;
  if (report) {
    hasAnyProgress =
      report.stats.journey_steps_tracked > 0 || report.stats.tasks_accepted > 0;
    for (const step of report.steps) {
      for (const task of step.tasks) {
        if (task.active_days_last_7 > activeDaysLast7) {
          activeDaysLast7 = task.active_days_last_7;
        }
        if (task.status === 'accepted' && !task.execution_done) openTasksToday += 1;
      }
    }
  }

  const signals: BriefSignals = {
    daysSinceLastActive,
    weeklyCompleted,
    activeDaysLast7,
    openTasksToday,
    hasAnyProgress,
  };

  const progressText = report ? formatUserProgressForAi(report) : '';
  const coachingBlock = buildCoachingStylePromptBlock(aiContext);
  const chatLine =
    chatTurns.length > 0
      ? chatTurns.map((t) => `${t.role === 'user' ? 'המשתמש' : 'אלמוג'}: "${t.snippet}"`).join('\n')
      : 'אין שיחה היום.';

  const userContent = [
    `שם פרטי: ${firstName}`,
    daysSinceLastActive !== null ? `ימים מאז כניסה אחרונה: ${daysSinceLastActive}` : null,
    contextResult ? contextResult.contextString : null,
    coachingBlock || null,
    progressText || null,
    `--- שיחה מהיום ---\n${chatLine}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  if (!process.env.OPENROUTER_API_KEY?.trim()) {
    return { brief: buildFallbackBrief(signals, firstName), used_fallback: true, model: null };
  }

  try {
    const completion = await openrouter.chat.completions.create({
      model: BRIEF_MODEL,
      temperature: 0.7,
      max_tokens: 600,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: BRIEF_SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? '';
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    const headline = clampText(parsed.headline, 60);
    const body = clampText(parsed.body, 360);
    if (!headline || !body) {
      return { brief: buildFallbackBrief(signals, firstName), used_fallback: true, model: BRIEF_MODEL };
    }

    const action = coerceAction(parsed.cta_action);
    const ctaPromptRaw = clampText(parsed.cta_prompt, 200);

    const brief: DashboardBrief = {
      headline,
      body,
      cta_label: clampText(parsed.cta_label, 28) || 'בוא נדבר',
      cta_action: action,
      cta_prompt: action === 'open_chat' ? ctaPromptRaw || null : null,
      mood: coerceMood(parsed.mood),
    };

    return { brief, used_fallback: false, model: BRIEF_MODEL };
  } catch (error) {
    console.error('[dashboard-brief-llm] generation failed', error);
    return { brief: buildFallbackBrief(signals, firstName), used_fallback: true, model: BRIEF_MODEL };
  }
}
