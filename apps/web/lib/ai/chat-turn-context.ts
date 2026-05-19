/**
 * בלוקים קומפקטיים לפרומפט צ'אט — מינימום טוקנים, מקסימום אות עבור התור הנוכחי.
 */

import type { ChatSignals } from './chat-signals';
import type { HabitIntentDetection } from './chat-habit-intent';
import type { TaskIntentDetection } from './chat-task-intent';
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

export function formatTaskIntentPromptBlock(intent: TaskIntentDetection): string | null {
  if (intent.kind !== 'done' || !intent.taskTitle) return null;
  const t = intent.taskTitle.slice(0, 40);
  return `[משימה:${t}·בוצע] חיזוק קצר; המערכת כבר עדכנה ביצוע.`;
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
    'tasks: ✓ בוצע · ◐ בתהליך · ○ פתוח — דבר רק לפי הסטטוס.',
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
