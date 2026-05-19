import type { SupabaseClient } from '@supabase/supabase-js';
import { parseTimeToMinutes } from '../ai/generate-mentor-system-prompt';
import type { HabitCheckpointSlot } from './almog-habit-checkpoint-payload';
import {
  collectPendingAcceptedTasks,
  collectUserJourneyHabits,
  type ProgressRow,
} from './habit-checkpoint-batch';
import {
  filterHabitsForSlot,
  jerusalemCalendarParts,
} from './habit-checkpoint-eligibility';

const JOURNEY_PROGRESS_SELECT = `
  user_id,
  updated_at,
  is_completed,
  task_statuses,
  journey_steps (
    title,
    habits,
    tasks,
    journey_stations ( title )
  )
`;

/** ממפה שעת בדיקה (ישראל) לחלון בוקר/צהריים/ערב — כמו habit-checkpoints */
export function habitSlotFromCheckInTime(checkInTime: string): HabitCheckpointSlot {
  const mins = parseTimeToMinutes(checkInTime);
  const hour = Math.floor((mins % (24 * 60)) / 60);
  if (hour < 11) return 'morning';
  if (hour < 16) return 'midday';
  return 'evening';
}

export type PersonalizedJourneyContext = {
  slot: HabitCheckpointSlot;
  stepTitle: string | null;
  stationTitle: string | null;
  habits: Array<{ id: string; title: string; frequency: string }>;
  pendingTasks: Array<{ id: string; title: string; stepTitle: string | null }>;
};

export async function fetchPersonalizedCheckInJourneyContext(
  admin: SupabaseClient,
  userId: string,
  checkInTime: string,
  now = new Date()
): Promise<PersonalizedJourneyContext | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from('journey_progress')
    .select(JOURNEY_PROGRESS_SELECT)
    .eq('user_id', userId);

  if (error || !data?.length) return null;

  const rows = data as ProgressRow[];
  const slot = habitSlotFromCheckInTime(checkInTime);
  const { weekday } = jerusalemCalendarParts(now);
  const habits = collectUserJourneyHabits(rows);
  const due = habits.length > 0 ? filterHabitsForSlot(habits, slot, weekday) : [];
  const pendingTasks = collectPendingAcceptedTasks(rows);

  if (due.length === 0 && pendingTasks.length === 0) return null;

  const incomplete = [...rows]
    .filter((r) => !r.is_completed)
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  const display = incomplete[0] ?? rows[0];
  const st = display?.journey_steps?.journey_stations;
  const stationTitle =
    Array.isArray(st) && st[0] && typeof st[0] === 'object' && 'title' in st[0]
      ? String((st[0] as { title?: string }).title ?? '')
      : st && typeof st === 'object' && 'title' in st
        ? String((st as { title?: string }).title ?? '')
        : null;

  return {
    slot,
    stepTitle: display?.journey_steps?.title?.trim() ?? null,
    stationTitle: stationTitle || null,
    habits: due.map((h) => ({ id: h.id, title: h.title, frequency: h.frequency })),
    pendingTasks: pendingTasks.slice(0, 8).map((t) => ({
      id: t.id,
      title: t.title,
      stepTitle: t.stepTitle,
    })),
  };
}

export function formatJourneyBlockForPersonalizedCheckIn(ctx: PersonalizedJourneyContext): string {
  const habitLines = ctx.habits.map(
    (h) =>
      `- ${h.title} (${h.frequency === 'per_meal' ? 'מסביב לארוחות' : h.frequency === 'daily' ? 'יומי' : 'שבועי'})`
  );
  const taskLines = ctx.pendingTasks.map(
    (t) => `- ${t.title}${t.stepTitle ? ` (צעד: ${t.stepTitle})` : ''}`
  );

  const parts: string[] = [`חלון יום במסע: ${ctx.slot}`];
  if (ctx.stepTitle || ctx.stationTitle) {
    parts.push(
      `מיקום במסע: ${ctx.stepTitle ?? 'צעד'}${ctx.stationTitle ? ` · תחנה ${ctx.stationTitle}` : ''}`
    );
  }
  if (taskLines.length) {
    parts.push(
      `נושאים במסע לשיחה (רקע פנימי — לא לבדוק ביצוע):\n${taskLines.join('\n')}`
    );
  }
  if (habitLines.length) {
    parts.push(`רוטינות מהמסע לחלון הזה:\n${habitLines.join('\n')}`);
  }
  parts.push('שלב רלוונטי מהמסע בזרימה טבעית — בלי המילים "משימה" או "הרגל".');
  return parts.join('\n\n');
}
