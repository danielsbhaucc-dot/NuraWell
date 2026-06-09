/**
 * סימון הרגל ב-journey_progress — מהצ'אט, chips או API.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { parseJourneyHabitsJson } from '../workflows/habit-checkpoint-eligibility';

const WATER_HABIT_RE = /מים|שתייה|לשתות|רטוב/i;

export type MicroWinHabitResult =
  | { ok: true; stepId: string; habitId: string; habitTitle: string }
  | { ok: false; error: 'no_active_step' | 'no_habit' | 'save_failed'; message: string };

type MicroWinHabitError = Extract<MicroWinHabitResult, { ok: false }>['error'];

function pickMicroWinHabit(
  habits: ReturnType<typeof parseJourneyHabitsJson>,
  preferredHabitId?: string
): { id: string; title: string } | null {
  const daily = habits.filter((h) => h.frequency === 'daily');
  if (daily.length === 0) return null;

  if (preferredHabitId) {
    const match = daily.find((h) => h.id === preferredHabitId);
    if (match) return { id: match.id, title: match.title };
  }

  const water = daily.find((h) => WATER_HABIT_RE.test(h.title));
  const pick = water ?? daily[0]!;
  return { id: pick.id, title: pick.title };
}

async function loadActiveStepHabits(
  supabase: SupabaseClient,
  userId: string
): Promise<
  | { ok: true; stepId: string; habits: ReturnType<typeof parseJourneyHabitsJson>; prevHp: Record<string, boolean[]> }
  | { ok: false; error: MicroWinHabitError; message: string }
> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: progress, error: progErr } = await (supabase as any)
    .from('journey_progress')
    .select('step_id, habits_progress')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (progErr) {
    return { ok: false, error: 'save_failed', message: progErr.message };
  }

  const stepId = progress?.step_id as string | undefined;
  if (!stepId) {
    return { ok: false, error: 'no_active_step', message: 'אין צעד פעיל במסע' };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: step, error: stepErr } = await (supabase as any)
    .from('journey_steps')
    .select('habits')
    .eq('id', stepId)
    .maybeSingle();

  if (stepErr) {
    return { ok: false, error: 'save_failed', message: stepErr.message };
  }

  const prevHp =
    progress?.habits_progress &&
    typeof progress.habits_progress === 'object' &&
    !Array.isArray(progress.habits_progress)
      ? (progress.habits_progress as Record<string, boolean[]>)
      : {};

  return {
    ok: true,
    stepId,
    habits: parseJourneyHabitsJson(step?.habits),
    prevHp,
  };
}

/**
 * מסמן הרגל יומי (עדיפות למים / habitId) כבוצע היום בצעד הפעיל.
 */
export async function markHabitForUser(
  supabase: SupabaseClient,
  userId: string,
  preferredHabitId?: string
): Promise<MicroWinHabitResult> {
  const loaded = await loadActiveStepHabits(supabase, userId);
  if (!loaded.ok) {
    return { ok: false, error: loaded.error, message: loaded.message };
  }

  const habit = pickMicroWinHabit(loaded.habits, preferredHabitId);
  if (!habit) {
    return { ok: false, error: 'no_habit', message: 'אין הרגל יומי בצעד הנוכחי' };
  }

  const habits_progress = { ...loaded.prevHp, [habit.id]: [true] };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nowIso = new Date().toISOString();
  const { error: upErr } = await (supabase as any).from('journey_progress').upsert(
    {
      user_id: userId,
      step_id: loaded.stepId,
      habits_progress,
      updated_at: nowIso,
      /** אות פעילות-משתמש אמיתי ל-dormancy engine (migration 000047). */
      last_engaged_at: nowIso,
    },
    { onConflict: 'user_id,step_id' }
  );

  if (upErr) {
    return { ok: false, error: 'save_failed', message: upErr.message };
  }

  return { ok: true, stepId: loaded.stepId, habitId: habit.id, habitTitle: habit.title };
}

/** @deprecated — השתמש ב-markHabitForUser */
export async function markMicroWinHabitForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<MicroWinHabitResult> {
  return markHabitForUser(supabase, userId);
}

/**
 * `opt-out` של הרגל ספציפי — *לא מסמן ביצוע*; מסמן ב-`habit_meta` שהמשתמש
 * לא רוצה את ההרגל הזה. ה-cron של habit-checkpoints + ה-UI יכבדו את הסימון
 * הזה ולא ימשיכו לבקש את ההרגל.
 *
 * דוגמת קלט מהמשתמש שמובילה לפה:
 *   • "אני לא רוצה את ההרגל הזה"
 *   • "תוריד לי את ההרגל"
 *   • "זה לא מתאים לי"
 *
 * המבנה נשמר ב-`journey_progress.habit_meta`:
 *   {
 *     [habitId]: {
 *       opted_out: true,
 *       opted_out_at: '2026-01-15T10:30:00Z',
 *       ...meta קיים אם יש (streak וכו')
 *     }
 *   }
 *
 * אין צריכים מיגרציית DDL — `habit_meta` הוא JSONB גמיש (מיגרציה 000024).
 */
export type OptOutHabitResult =
  | { ok: true; stepId: string; habitId: string }
  | { ok: false; error: 'no_active_step' | 'save_failed'; message: string };

export async function optOutHabitForUser(
  supabase: SupabaseClient,
  userId: string,
  habitId: string
): Promise<OptOutHabitResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: progress, error: progErr } = await (supabase as any)
    .from('journey_progress')
    .select('step_id, habit_meta')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (progErr) {
    return { ok: false, error: 'save_failed', message: progErr.message };
  }

  const stepId = progress?.step_id as string | undefined;
  if (!stepId) {
    return { ok: false, error: 'no_active_step', message: 'אין צעד פעיל במסע' };
  }

  const prevMeta =
    progress?.habit_meta && typeof progress.habit_meta === 'object' && !Array.isArray(progress.habit_meta)
      ? (progress.habit_meta as Record<string, Record<string, unknown>>)
      : {};

  const existing = prevMeta[habitId] ?? {};
  const habit_meta = {
    ...prevMeta,
    [habitId]: {
      ...existing,
      opted_out: true,
      opted_out_at: new Date().toISOString(),
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const optOutNowIso = new Date().toISOString();
  const { error: upErr } = await (supabase as any).from('journey_progress').upsert(
    {
      user_id: userId,
      step_id: stepId,
      habit_meta,
      updated_at: optOutNowIso,
      /** אות פעילות-משתמש אמיתי ל-dormancy engine (migration 000047). */
      last_engaged_at: optOutNowIso,
    },
    { onConflict: 'user_id,step_id' }
  );

  if (upErr) {
    return { ok: false, error: 'save_failed', message: upErr.message };
  }

  return { ok: true, stepId, habitId };
}

/**
 * האם הרגל זה הוסר (opt-out) ע"י המשתמש? — שימוש ב-cron ובאקסטרקציה לכבד
 * את הרצון. מחזיר `false` בשגיאות (fail-open: עדיף לשאול ולא להתעלם).
 */
export async function isHabitOptedOut(
  supabase: SupabaseClient,
  userId: string,
  habitId: string
): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from('journey_progress')
      .select('habit_meta')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const meta =
      data?.habit_meta && typeof data.habit_meta === 'object' && !Array.isArray(data.habit_meta)
        ? (data.habit_meta as Record<string, { opted_out?: boolean }>)
        : {};

    return meta[habitId]?.opted_out === true;
  } catch {
    return false;
  }
}
