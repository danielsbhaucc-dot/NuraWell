/**
 * זיהוי ביצוע / אי-ביצוע הרגל מתוך טקסט חופשי בצ'אט.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { markHabitForUser } from './micro-win-habit';

export type HabitIntentKind = 'done' | 'miss' | 'none';

export type HabitIntentDetection = {
  kind: HabitIntentKind;
  habitId?: string;
  habitTitle?: string;
};

/** המשתמש מדווח שביצע שתייה / מים — לא שאלה ולא שלילה. */
const WATER_DONE_RE =
  /(?:כבר\s+)?(?:שתיתי|שתית|שתייתי|שתינו)(?:\s+(?:עכשיו|היום|בבוקר|לפני\s+כמה))?|(?:עשיתי|ביצעתי|סימנתי|סיימתי)\s+(?:את\s+)?(?:ה)?מים|כוס\s+מים\s+(?:עכשיו|היום|בבוקר|לפני)|(?:שתיתי|שתית)\s+כוס|שתיתי\s+(?:כוס\s+)?מים|שתית\s+מים/i;

/** שלילה / תוכניות עתידיות — לא לסמן V. */
const HABIT_NOT_DONE_RE =
  /(?:לא\s+(?:שתיתי|שתית|עשיתי|ביצעתי|הספקתי|סימנתי)|עדיין\s+לא\s+(?:שתיתי|עשיתי)|שכחתי\s+(?:לשתות|לעשות)|לא\s+הייתה\s+לי\s+גישה\s+למים|אשתה\s+מחר|אעשה\s+מחר|רוצה\s+ל(?:שתות|עשות)|מתי\s+ל(?:שתות|עשות))/i;

const HABIT_DONE_RE =
  /(?:עשיתי|ביצעתי|סימנתי|סיימתי|הצלחתי|כבר\s+עשיתי|עשינו|ביצענו)/i;

const WATER_HABIT_TITLE_RE = /מים|שתייה|לשתות|רטוב/i;

function normalizeMsg(t: string): string {
  return t.replace(/\s+/g, ' ').trim();
}

function habitTitleKeywords(title: string): string[] {
  return title
    .split(/[\s,·\-/]+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2);
}

function messageReferencesHabit(msg: string, title: string): boolean {
  if (WATER_HABIT_TITLE_RE.test(title) && /מים|שתי|לשתות/i.test(msg)) return true;
  const kws = habitTitleKeywords(title);
  if (kws.length === 0) return false;
  return kws.some((kw) => msg.includes(kw));
}

/** @deprecated — השתמש ב-detectHabitIntent */
export function detectWaterHabitCompletionIntent(userMessage: string): boolean {
  return detectHabitIntent(userMessage, []).kind === 'done';
}

/**
 * מזהה דיווח ביצוע / miss מול הרגלי הצעד (או מים בלבד אם אין רשימה).
 */
export function detectHabitIntent(
  userMessage: string,
  habits: Array<{ id: string; title: string }>
): HabitIntentDetection {
  const msg = normalizeMsg(userMessage);
  if (msg.length < 6) return { kind: 'none' };

  const isMiss = HABIT_NOT_DONE_RE.test(msg);
  const isDone = !isMiss && (WATER_DONE_RE.test(msg) || HABIT_DONE_RE.test(msg));

  if (!isMiss && !isDone) return { kind: 'none' };

  const candidates = habits.length > 0 ? habits : [];

  if (candidates.length > 0) {
    for (const h of candidates) {
      if (!messageReferencesHabit(msg, h.title)) continue;
      if (isMiss) return { kind: 'miss', habitId: h.id, habitTitle: h.title };
      if (isDone) return { kind: 'done', habitId: h.id, habitTitle: h.title };
    }
    if (isMiss && WATER_HABIT_TITLE_RE.test(msg)) {
      const water = candidates.find((h) => WATER_HABIT_TITLE_RE.test(h.title));
      if (water) return { kind: 'miss', habitId: water.id, habitTitle: water.title };
    }
    if (isDone && WATER_DONE_RE.test(msg)) {
      const water = candidates.find((h) => WATER_HABIT_TITLE_RE.test(h.title));
      if (water) return { kind: 'done', habitId: water.id, habitTitle: water.title };
    }
    return { kind: 'none' };
  }

  if (WATER_DONE_RE.test(msg) && !isMiss) {
    return { kind: 'done', habitTitle: 'מים' };
  }
  if (isMiss && /מים|שתי|גישה\s+למים/i.test(msg)) {
    return { kind: 'miss', habitTitle: 'מים' };
  }

  return { kind: 'none' };
}

export async function applyHabitIntentFromUserMessage(
  supabase: SupabaseClient,
  userId: string,
  userMessage: string,
  habits: Array<{ id: string; title: string }> = []
): Promise<{ marked: boolean; habitTitle?: string; intent: HabitIntentDetection }> {
  const intent = detectHabitIntent(userMessage, habits);

  if (intent.kind !== 'done') {
    return { marked: false, intent };
  }

  const result = await markHabitForUser(supabase, userId, intent.habitId);
  if (!result.ok) {
    return { marked: false, intent };
  }

  return {
    marked: true,
    habitTitle: result.habitTitle,
    intent: { ...intent, habitId: result.habitId, habitTitle: result.habitTitle },
  };
}
