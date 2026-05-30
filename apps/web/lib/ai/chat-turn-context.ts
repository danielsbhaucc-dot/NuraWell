/**
 * בלוקים קומפקטיים לפרומפט צ'אט — מינימום טוקנים, מקסימום אות עבור התור הנוכחי.
 */

import type { ChatSignals } from './chat-signals';
import type { HabitIntentDetection } from './chat-habit-intent';
import type { TaskIntentDetection } from './chat-task-intent';
import type { PendingAcceptedTask } from './mark-task-execution';
import { inferSlotFromUserMessage } from './mark-task-execution';
import { slotLabel } from '../journey/task-schedule';
import type { HabitGapSignal } from './roller-coaster';

/** מונע כפילות כשהחסם כבר מופיע ב-[יום]. */
export function shouldInjectBlockerSignal(
  signals: ChatSignals,
  dailyBlock: string | null
): boolean {
  if (!signals.blocker_mentioned || !signals.main_blocker) return false;
  if (!dailyBlock) return true;
  return !dailyBlock.includes(`חסם:${signals.main_blocker}`);
}

const EMOTION_TAG: Record<NonNullable<ChatSignals['emotional_hint']>, string> = {
  resigned: 'ויתור',
  self_blame: 'ביקורת-עצמית',
  frustrated: 'תסכול',
  heavy: 'כובד',
  low_energy: 'אנרגיה-נמוכה',
};

/**
 * בלוק אותות מההודעה הנוכחית — רק כשיש משהו לטפל בו באותה תשובה.
 */
export function formatChatSignalsPromptBlock(
  signals: ChatSignals,
  opts?: { skipBlocker?: boolean }
): string | null {
  const parts: string[] = [];
  if (signals.blocker_mentioned && signals.main_blocker && !opts?.skipBlocker) {
    parts.push(`חסם:${signals.main_blocker}`);
  }
  if (signals.emotional_hint) {
    parts.push(`רגש:${EMOTION_TAG[signals.emotional_hint]}`);
  }
  if (signals.avoid_push_requested) {
    parts.push('פחות-דחיפה');
  }
  if (signals.daily_availability_low_requested) {
    parts.push('זמינות-נמוכה-היום');
  }
  if (parts.length === 0) return null;
  return `[אות-עכשיו] ${parts.join('·')} — ולידציה+שאלה; בלי "נסה מחר" בלי צעד עכשיו.`;
}

export function formatHabitIntentPromptBlock(intent: HabitIntentDetection): string | null {
  if (intent.kind === 'none' || !intent.habitTitle) return null;
  const h = intent.habitTitle.slice(0, 40);
  if (intent.kind === 'miss') {
    return `[הרגל:${h}·לא] דיון לא-V: סיבה→פתרון מעשי→שאלה על מחר.`;
  }
  return `[הרגל:${h}·כן] חיזוק קצר; אל תבקש סימון V.`;
}

export function formatTaskIntentPromptBlock(
  intent: TaskIntentDetection,
  opts?: {
    emotionalHint?: ChatSignals['emotional_hint'];
    /**
     * המשימה ה-pending שזוהתה (אופציונלי). אם הועברה, נוסיף לבלוק רמז על
     * schedule + הסלוט שמסומן עכשיו, כדי שה-AI יוכל לשאול אנושית
     * "וגם בערב?" כשהמשימה היא per_meal / multi_daily.
     */
    matchedTask?: PendingAcceptedTask;
    /** הודעת המשתמש — משמשת להסקת הסלוט אם המשתמש ציין במפורש ("בצהריים"). */
    userMessage?: string;
  }
): string | null {
  if (intent.kind !== 'done' || !intent.taskTitle) return null;
  const t = intent.taskTitle.slice(0, 40);
  let afterDifficulty = '';
  if (opts?.emotionalHint === 'resigned' || opts?.emotionalHint === 'self_blame') {
    afterDifficulty =
      ' · לפני כן ויתור/ביקורת עצמית — חזק: "העיקר שהגעת", "אמרת שלא תצליח — ועדיין עשית".';
  } else if (opts?.emotionalHint === 'heavy' || opts?.emotionalHint === 'frustrated') {
    afterDifficulty = ' · אחרי קושי — חיזוק חם ספציפי, לא "מערכת".';
  }

  // 🎯 הקשר רב-סלוטי: כשהמשימה רב-סלוטית (per_meal / multi_daily) ה-AI חייב
  // לדעת על כך *לפני שהוא מגיב*, כדי לשאול בעדינות "וגם בערב?" במקום
  // לתת חיזוק חד-פעמי שמתעלם מהשאר. את הסלוט המדויק שיסומן אנחנו מסיקים
  // מטקסט המשתמש או משעה בירושלים (אותה לוגיקה כמו `markRecurringSlot`).
  let slotHint = '';
  if (opts?.matchedTask) {
    const m = opts.matchedTask;
    if (m.schedule === 'per_meal' || m.schedule === 'multi_daily') {
      const slot = inferSlotFromUserMessage(
        opts.userMessage ?? '',
        m.schedule,
        m.times_per_day
      );
      const label = slotLabel(slot);
      slotHint = ` · משימה רב-סלוטית (${m.schedule}, ${m.times_per_day}/יום) · יסומן: ${label} · ייתכן שיש סלוטים נוספים פתוחים היום — שאל בעדינות אם יבצע גם שם ("גם בערב?", "תותח, רק עכשיו?")`;
    }
  }

  return `[משימה:${t}·בוצע]${slotHint} רק חיזוק אנושי קצר ("אלוף", "גאה בך") — אסור: מערכת/עדכנתי/סימנתי/המערכת עודכנה.${afterDifficulty}`;
}

function scheduleLabelHe(task: PendingAcceptedTask): string {
  switch (task.schedule) {
    case 'daily':
      return 'יומי';
    case 'multi_daily':
      return `${task.times_per_day}/יום`;
    case 'weekly':
      return 'שבועי';
    case 'per_meal':
      return 'לפני ארוחות';
    case 'one_time':
    default:
      return 'חד-פעמי';
  }
}

export function formatPendingAcceptedTasksPromptBlock(
  tasks: readonly PendingAcceptedTask[]
): string | null {
  if (tasks.length === 0) return null;
  const shown = tasks.slice(0, 6);
  const lines = [
    '[משימות פתוחות שהמשתמש כבר קיבל — מקור אמת]',
    ...shown.map((task) => {
      const step = task.stepTitle ? ` · צעד: ${task.stepTitle.slice(0, 36)}` : '';
      return `○ ${task.title.slice(0, 60)} [${scheduleLabelHe(task)}${step}]`;
    }),
    'אם המשתמש שואל "מה המשימות שלי" או "מה נשאר" — ענה לפי הרשימה הזו. אם הוא מדווח ביצוע — חזק בקצרה ואל תמשיך לבקש אותה.',
  ];
  return lines.join('\n');
}

/** פער הרגל 3+ ימים — רק כשלא כבר בנושא השיחה. */
export function formatHabitGapChatBlock(gap: HabitGapSignal | null): string | null {
  if (!gap || gap.daysMissed < 3) return null;
  const h = gap.habitTitle.slice(0, 36);
  return `[פער-הרגל:${h}·${gap.daysMissed}יום] בלי שיפוט; צעד זעיר — רק אם ההרגל לא מסומן ✓ היום בנתוני מסע.`;
}

/** הודעת פתיחה קצרה בלי בקשת פעולה מפורשת. */
export function isCasualGreeting(text: string): boolean {
  const t = text.trim().replace(/\s+/g, ' ');
  if (!t || t.length > 40) return false;
  return /^(היי|הי|שלום|הי\s|מה נשמע|אהלן|בוקר טוב|ערב טוב|צהריים טובים|מה קורה|מה נשמע\?)([!.\s?]*)$/iu.test(
    t
  );
}

/** הנחיות קריאת נתוני מסע — מונע "נבדוק מים" כשכבר ✓ במערכת. */
export function formatJourneyChatGuidanceBlock(opts: {
  journeyData: Record<string, unknown> | null;
  isGreeting: boolean;
}): string | null {
  if (!opts.journeyData) return null;
  const lines = [
    '[נתוני מסע — מקור אמת לביצוע היום]',
    'habits: ✓ = המשתמש כבר סימן ביצוע היום — אל תציע שוב, לא "נבדוק ביחד", לא תזכורת. אפשר חיזוק קצר במשפט.',
    'habits: ○ = לא סומן — שאלה רכה אחת או הצעה קטנה.',
    'tasks: ✓ בוצע היום · ◐ חלקי (למשל 1/3) · ○ פתוח — דבר רק לפי הסטטוס.',
    'משימות יומיות/לפני-ארוחה מתאפסות מחר — ✓ היום לא אומר "סגור לנצח".',
    'אם מופיע "היום X/Y" — שאל רק על הסלוטים שנשארו, לא על מה שכבר ✓.',
  ];
  if (opts.isGreeting) {
    lines.push(
      'פתיחה (היי וכו\'): ברכה חמה וקצרה + שאלה על משימה ○ או הרגל ○ — לא על מה שכבר ✓. לא רשימת עובדות.'
    );
  }
  return lines.join('\n');
}

export function formatWeightLoggedPromptBlock(kg: number): string {
  return `[משקל] ${kg}קג — אשר במשפט אחד; אל תבקש טופס.`;
}

/** JSON קומפקטי למסע — פחות טוקנים ממערכים נפרדים. */
export type CompactTaskState = 'open' | 'accepted_pending' | 'done' | 'rejected';

export type JourneyTaskScheduleAi =
  | 'one_time'
  | 'daily'
  | 'multi_daily'
  | 'weekly'
  | 'per_meal';

export type TaskForAiContext = {
  title: string;
  state: CompactTaskState;
  schedule?: JourneyTaskScheduleAi;
  /** לדוגמה "2/3" — כמה סלוטים בוצעו היום */
  slotsToday?: string;
  /** סלוטים שכבר בוצעו היום — לדוגמה "בוקר, צהריים" */
  completedSlotsLabel?: string;
};

export function buildCompactJourneyDataBlock(input: {
  stepTitle: string;
  tasks: Array<{ title: string; state: CompactTaskState }>;
  habits: Array<{ title: string; doneToday: boolean }>;
}): Record<string, unknown> {
  const taskPrefix: Record<CompactTaskState, string> = {
    open: '○',
    accepted_pending: '◐',
    done: '✓',
    rejected: '✗',
  };
  return {
    step: input.stepTitle,
    tasks: input.tasks.map((t) => `${taskPrefix[t.state]}${t.title}`),
    habits: input.habits.map((h) => `${h.doneToday ? '✓' : '○'}${h.title}`),
  };
}

/**
 * רינדור נתוני המסע כטקסט עברי טבעי לפרומפט — לא JSON גולמי.
 * מודלי mini מתעכלים טקסט הרבה יותר טוב מ-JSON בתוך פרומפט.
 *
 * דוגמה לפלט:
 *   במסע עכשיו — צעד: "להתחיל לשתות מים בבוקר".
 *   הרגלי היום:
 *     ✓ כוס מים אחרי השכמה
 *     ○ הליכה 10 דק' אחרי ארוחה
 *   משימות פתוחות:
 *     ○ לקנות בקבוק נשיאה
 *     ◐ למלא טופס שעות שינה
 */
export function formatJourneyContextAsHebrewText(input: {
  stepTitle: string;
  tasks: TaskForAiContext[];
  habits: Array<{ title: string; doneToday: boolean }>;
}): string | null {
  const { stepTitle, tasks, habits } = input;
  if (!stepTitle && tasks.length === 0 && habits.length === 0) return null;

  const lines: string[] = [];
  if (stepTitle) {
    lines.push(`במסע עכשיו — צעד: "${stepTitle}".`);
  }

  if (habits.length > 0) {
    lines.push('הרגלי היום:');
    for (const h of habits) {
      const mark = h.doneToday ? '✓' : '○';
      lines.push(`  ${mark} ${h.title}`);
    }
  }

  if (tasks.length > 0) {
    const prefix: Record<CompactTaskState, string> = {
      open: '○',
      accepted_pending: '◐',
      done: '✓',
      rejected: '✗',
    };
    lines.push('משימות הצעד:');
    for (const t of tasks) {
      let line = `  ${prefix[t.state]} ${t.title}`;
      if (t.schedule && t.schedule !== 'one_time') {
        const sched =
          t.schedule === 'daily'
            ? 'יומי'
            : t.schedule === 'multi_daily'
              ? 'כמה פעמים ביום'
              : t.schedule === 'weekly'
                ? 'שבועי'
                : 'לפני ארוחה';
        line += ` [${sched}`;
        if (t.slotsToday) line += ` · היום ${t.slotsToday}`;
        if (t.completedSlotsLabel) line += ` · בוצע: ${t.completedSlotsLabel}`;
        line += ']';
      }
      lines.push(line);
    }
  }

  lines.push(
    'כללי: ✓ = בוצע היום (אל תציע שוב). ○ = פתוח (אפשר שאלה רכה). ◐ = בתהליך/חלקי. ✗ = נדחה. משימות יומיות מתאפסות מחר.'
  );
  return lines.join('\n');
}
