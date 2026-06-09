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
  const { data, error } = await admin
    .from('journey_progress')
    .select(JOURNEY_PROGRESS_SELECT)
    .eq('user_id', userId);

  if (error || !data?.length) return null;

  const rows = data as unknown as ProgressRow[];
  const slot = habitSlotFromCheckInTime(checkInTime);
  const { dateKey: todayKey, weekday } = jerusalemCalendarParts(now);
  const habits = collectUserJourneyHabits(rows);
  const due = habits.length > 0 ? filterHabitsForSlot(habits, slot, weekday) : [];

  /** טוען ביצועי סלוטים של היום עבור משימות חוזרות — כדי לא לתזכר אחרי שכבר בוצע. */
  const todayDoneByTask = new Map<string, Set<string>>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: execRows } = await admin
    .from('journey_task_executions')
    .select('task_id, slot')
    .eq('user_id', userId)
    .eq('date_key', todayKey)
    .limit(200);
  if (Array.isArray(execRows)) {
    for (const row of execRows as Array<{ task_id?: string; slot?: string }>) {
      const tid = typeof row.task_id === 'string' ? row.task_id : '';
      const sl = typeof row.slot === 'string' ? row.slot : '';
      if (!tid || !sl) continue;
      const cur = todayDoneByTask.get(tid) ?? new Set<string>();
      cur.add(sl);
      todayDoneByTask.set(tid, cur);
    }
  }

  const pendingTasks = collectPendingAcceptedTasks(rows, {
    todayDoneByTask,
    cronSlot: slot,
    jerusalemWeekday: weekday,
  });

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
  const habitLines = ctx.habits.slice(0, 2).map((h) => `- ${h.title}`);
  const taskLines = ctx.pendingTasks.slice(0, 2).map((t) => `- ${t.title}`);

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
