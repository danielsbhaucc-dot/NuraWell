import type { SupabaseClient } from '@supabase/supabase-js';

import { openrouter } from './client';
import { buildUserContext, israelDateKeyForAiContext } from './memory';
import { fetchTodayChatTurns } from './almog-daily-context';
import { buildCoachingStylePromptBlock } from './almog-coaching-style';
import { formatUserProgressForAi } from './format-user-progress-for-ai';
import { buildAdminUserJourneyReport } from '../admin/build-user-journey-report';
import {
  HEBREW_DASH_PROMPT_RULE,
  MOMENTUM_PSYCHOLOGY_PROMPT_BLOCK,
  partOfDayInIsrael,
  pickMomentumSpark,
  type PartOfDay,
} from './momentum-psychology';
import { normalizeHebrewDashes } from '../text/hebrew-dashes';

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

const BRIEF_SYSTEM_PROMPT = `אתה אלמוג, מנטור הליווי האישי של NuraWell. גבר, חבר אמיתי, עברית יומיומית וחמה, לא בוט ולא מערכת.
המשימה שלך כאן: לכתוב "תקציר חי" קצר שמופיע בראש מסך הבית של המשתמש בכל כניסה. זו לא שיחה, זו הצצה אישית שלך למה שחשוב למשתמש *עכשיו*, על סמך הנתונים שתקבל.

${MOMENTUM_PSYCHOLOGY_PROMPT_BLOCK}

החזר JSON בלבד (בלי markdown, בלי טקסט מסביב) בפורמט הבא:
{
  "headline": "שורת פתיחה אישית קצרה מאוד, עד 5 מילים. רגש או תנועה, לא תיאור יבש",
  "body": "2-3 משפטים אישיים, חמים וספציפיים בעברית. מבוססים אך ורק על הנתונים. משקפים מה קורה איתו, מדגישים את הצעד/הניצחון הקטן ומסתיימים בתחושת תנועה קדימה. שזור עיקרון מוטיבציה אחד שמתאים למצב, בלי לצטט אותו.",
  "cta_label": "טקסט כפתור קצר, 2-4 מילים, פעולה מזמינה ולא פקודה",
  "cta_action": "open_chat | open_journey | open_tasks | open_progress | open_courses",
  "cta_prompt": "אם cta_action=open_chat, משפט פתיחה לשיחה שייכתב *מנקודת מבט המשתמש* (גוף ראשון), טבעי וקצר. אחרת null",
  "mood": "celebrate | encourage | gentle | neutral"
}

כללי תוכן (קריטי):
- ספציפי לנתונים, לא גנרי. אם יש רצף, חגוג אותו עם המספר ותן לו ערך. אם יש היעדרות, חזור בעדינות עם חמלה, בלי אשמה ובלי "ראיתי שלא".
- בלי שפת מערכת: לא "המערכת", לא "סימנתי", לא "השלמת משימה", לא "ראיתי שלא".
- בלי הטפה ובלי רשימות. חם, אנושי, כמו הודעת וואטסאפ מחבר אמיתי.
- גיוון: אל תיפול לאותה תבנית. הטקסט צריך להרגיש כתוב היום, במיוחד לאדם הזה.
- התאם את חלק היום (בוקר/צהריים/ערב/לילה) לאנרגיה: בוקר = פתיחה והזמנה, ערב/לילה = סיכום עדין ורוגע.
- אם המשתמש לא היה פעיל כמה ימים: mood=gentle, cta_action=open_chat, CTA רכה ("בוא נחזור בעדינות").
- אם יש מומנטום/רצף חזק: mood=celebrate, אפשר cta_action=open_journey ("שמור על המומנטום").
- אם יש משימות פתוחות להיום: אפשר cta_action=open_tasks או open_chat.
- אם אין נתונים בכלל (משתמש חדש): mood=neutral, פתיחה מזמינה למסע, cta_action=open_journey.
- התאם את הטון לסגנון הליווי המבוקש אם צוין.
- אל תמציא נתונים שלא מופיעים. אל תזכיר שזה "תקציר" או "נתונים".
- ${HEBREW_DASH_PROMPT_RULE}`;

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
 * תקציר דטרמיניסטי — נכנס כש-LLM נכשל או חסר מפתח. עדיין אישי, מגוון ולא גנרי:
 * המשפטים נבחרים יומית לפי seed (תאריך + שם), כך שלא חוזר אותו דבר כל יום,
 * והם מבוססים על עקרונות שינוי-התנהגות (ניצחון קטן, שמירת רצף, חמלה, התחלה חדשה).
 */
function buildFallbackBrief(signals: BriefSignals, firstName: string): DashboardBrief {
  const name = firstName && firstName !== 'משתמש' ? firstName : '';
  const seed = `${signals.dateKey}:${name || 'x'}`;
  const greet = name ? `${name}, ` : '';

  // חזרה אחרי היעדרות — חמלה עצמית והתחלה חדשה.
  if (signals.daysSinceLastActive !== null && signals.daysSinceLastActive >= 3) {
    const spark = pickMomentumSpark('comeback', seed);
    return {
      headline: name ? `טוב לראות אותך, ${name}` : 'טוב לראות אותך',
      body: normalizeHebrewDashes(`עבר קצת זמן, וזה ממש בסדר. ${spark} מה שלומך עכשיו?`),
      cta_label: 'בוא נדבר רגע',
      cta_action: 'open_chat',
      cta_prompt: 'היי אלמוג, עבר קצת זמן. בוא נחזור בעדינות.',
      mood: 'gentle',
    };
  }

  // רצף חזק — חגיגה ושמירת מומנטום.
  if (signals.currentStreak >= 3 || signals.activeDaysLast7 >= 4) {
    const spark = pickMomentumSpark('streak', seed);
    const streakLine =
      signals.currentStreak >= 3
        ? `${signals.currentStreak} ימים ברצף`
        : `${signals.activeDaysLast7} מתוך 7 הימים האחרונים היית בתנועה`;
    return {
      headline: 'יש לך מומנטום 🔥',
      body: normalizeHebrewDashes(`${streakLine}. ${spark} בוא נשמור על הקצב היפה הזה.`),
      cta_label: 'שמור על המומנטום',
      cta_action: 'open_journey',
      cta_prompt: null,
      mood: 'celebrate',
    };
  }

  // משהו קטן פתוח להיום — צעד זעיר.
  if (signals.openTasksToday > 0) {
    const spark = pickMomentumSpark('smallStep', seed);
    const count =
      signals.openTasksToday === 1 ? 'צעד אחד קטן' : `${signals.openTasksToday} צעדים קטנים`;
    return {
      headline: signals.partOfDay === 'evening' || signals.partOfDay === 'night' ? 'עוד יש זמן להיום' : 'יש משהו קטן להיום',
      body: normalizeHebrewDashes(`נשאר לך ${count} להיום. ${spark} ספר לי כשעשית.`),
      cta_label: 'עדכון משימות',
      cta_action: 'open_tasks',
      cta_prompt: null,
      mood: 'encourage',
    };
  }

  // משתמש חדש — התחלה מזמינה.
  if (!signals.hasAnyProgress) {
    const spark = pickMomentumSpark('fresh', seed);
    return {
      headline: 'מתחילים את המסע',
      body: normalizeHebrewDashes(`כיף שאתה כאן 🌿 ${spark} אני איתך לאורך כל הדרך.`),
      cta_label: 'לצעד הראשון',
      cta_action: 'open_journey',
      cta_prompt: null,
      mood: 'neutral',
    };
  }

  // יש התקדמות אבל אין משימה פתוחה היום — בחירה אישית של מה חשוב.
  const spark = pickMomentumSpark('smallStep', seed);
  return {
    headline: name ? `${greet}אני כאן` : 'אני כאן איתך',
    body: normalizeHebrewDashes(`יום חדש, דף נקי. ${spark} מה מרגיש לך הכי נכון עכשיו?`),
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
  /** הרצף הנוכחי הגבוה ביותר בין ההרגלים — לשמירת מומנטום */
  currentStreak: number;
  /** שיא הרצף ההיסטורי — להזכרת יכולת מוכחת */
  bestStreak: number;
  /** ימים פעילים ב-30 האחרונים */
  activeDaysLast30: number;
  /** חלק היום בישראל — לטון מותאם */
  partOfDay: PartOfDay;
  /** מפתח תאריך — seed לבחירה יומית יציבה */
  dateKey: string;
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
  let currentStreak = 0;
  let bestStreak = 0;
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
      for (const habit of step.habits) {
        if (habit.streak_current > currentStreak) currentStreak = habit.streak_current;
        if (habit.streak_best > bestStreak) bestStreak = habit.streak_best;
      }
    }
  }

  const signals: BriefSignals = {
    daysSinceLastActive,
    weeklyCompleted,
    activeDaysLast7,
    openTasksToday,
    hasAnyProgress,
    currentStreak,
    bestStreak,
    activeDaysLast30: report?.stats.active_days_last_30 ?? 0,
    partOfDay: partOfDayInIsrael(),
    dateKey: israelDateKeyForAiContext(),
  };

  const progressText = report ? formatUserProgressForAi(report) : '';
  const coachingBlock = buildCoachingStylePromptBlock(aiContext);
  const chatLine =
    chatTurns.length > 0
      ? chatTurns.map((t) => `${t.role === 'user' ? 'המשתמש' : 'אלמוג'}: "${t.snippet}"`).join('\n')
      : 'אין שיחה היום.';

  const partOfDayLabel: Record<PartOfDay, string> = {
    morning: 'בוקר',
    noon: 'צהריים',
    evening: 'ערב',
    night: 'לילה',
  };
  const momentumLine = [
    `חלק היום: ${partOfDayLabel[signals.partOfDay]}`,
    `רצף נוכחי גבוה ביותר: ${signals.currentStreak} ימים`,
    signals.bestStreak > 0 ? `שיא רצף היסטורי: ${signals.bestStreak} ימים` : null,
    `ימים פעילים: ${signals.activeDaysLast7}/7, ${signals.activeDaysLast30}/30`,
    `משימות פתוחות להיום: ${signals.openTasksToday}`,
  ]
    .filter(Boolean)
    .join(' · ');

  const userContent = [
    `שם פרטי: ${firstName}`,
    daysSinceLastActive !== null ? `ימים מאז כניסה אחרונה: ${daysSinceLastActive}` : null,
    `--- אותות מומנטום ---\n${momentumLine}`,
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
      headline: normalizeHebrewDashes(headline),
      body: normalizeHebrewDashes(body),
      cta_label: normalizeHebrewDashes(clampText(parsed.cta_label, 28)) || 'בוא נדבר',
      cta_action: action,
      cta_prompt: action === 'open_chat' ? normalizeHebrewDashes(ctaPromptRaw) || null : null,
      mood: coerceMood(parsed.mood),
    };

    return { brief, used_fallback: false, model: BRIEF_MODEL };
  } catch (error) {
    console.error('[dashboard-brief-llm] generation failed', error);
    return { brief: buildFallbackBrief(signals, firstName), used_fallback: true, model: BRIEF_MODEL };
  }
}
