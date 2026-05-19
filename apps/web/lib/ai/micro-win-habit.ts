/**
 * סימון הרגל "ניצחון זעיר" (בעיקר מים) ב-journey_progress — מהצ'אט או API.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { parseJourneyHabitsJson } from '../workflows/habit-checkpoint-eligibility';

const WATER_HABIT_RE = /מים|שתייה|לשתות|רטוב/i;

export type MicroWinHabitResult =
  | { ok: true; stepId: string; habitId: string; habitTitle: string }
  | { ok: false; error: 'no_active_step' | 'no_habit' | 'save_failed'; message: string };

function pickMicroWinHabit(habits: ReturnType<typeof parseJourneyHabitsJson>): {
  id: string;
  title: string;
} | null {
  const daily = habits.filter((h) => h.frequency === 'daily');
  if (daily.length === 0) return null;
  const water = daily.find((h) => WATER_HABIT_RE.test(h.title));
  const pick = water ?? daily[0]!;
  return { id: pick.id, title: pick.title };
}

/**
 * מסמן הרגל יומי (עדיפות למים) כבוצע היום בצעד הפעיל האחרון.
 */
export async function markMicroWinHabitForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<MicroWinHabitResult> {
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

  const habit = pickMicroWinHabit(parseJourneyHabitsJson(step?.habits));
  if (!habit) {
    return { ok: false, error: 'no_habit', message: 'אין הרגל יומי בצעד הנוכחי' };
  }

  const prevHp =
    progress?.habits_progress && typeof progress.habits_progress === 'object' && !Array.isArray(progress.habits_progress)
      ? (progress.habits_progress as Record<string, boolean[]>)
      : {};

  const habits_progress = { ...prevHp, [habit.id]: [true] };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: upErr } = await (supabase as any).from('journey_progress').upsert(
    {
      user_id: userId,
      step_id: stepId,
      habits_progress,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,step_id' }
  );

  if (upErr) {
    return { ok: false, error: 'save_failed', message: upErr.message };
  }

  return { ok: true, stepId, habitId: habit.id, habitTitle: habit.title };
}
