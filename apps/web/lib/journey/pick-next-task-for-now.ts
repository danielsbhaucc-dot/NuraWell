/**
 * בחירת המשימה/סלוט הרלוונטי ביותר לרגע הנוכחי — לפי תזמון המשימה,
 * daily_rhythm מותאם אישית ועוגני זמן מהפרופיל.
 */

import type { JourneyTaskSlot } from '../types/journey';
import type { PendingTaskTodayRow } from './journey-report-parse';
import {
  resolveSlotTargetMinutes,
  type UserScheduleProfile,
} from './daily-rhythm';
import {
  currentSlotForSchedule,
  jerusalemMinutesIntoDay,
  slotLabel,
} from './task-schedule';

export type { UserScheduleProfile } from './daily-rhythm';

export type NextTaskPreview = {
  taskId: string;
  title: string;
  emoji: string;
  slot: string;
  slotLabelHe: string;
  timeHint: string;
};

function slotRelevanceScore(targetMin: number, nowMin: number): number {
  const delta = targetMin - nowMin;
  if (delta >= -30) return Math.max(0, delta);
  return 24 * 60 + delta;
}

export function pickNextTaskForNow(
  tasks: readonly PendingTaskTodayRow[],
  profile: UserScheduleProfile = {},
  now: Date = new Date()
): NextTaskPreview | null {
  const pending = tasks.filter((t) => !t.done);
  if (!pending.length) return null;

  const nowMin = jerusalemMinutesIntoDay(now);
  let best: { task: PendingTaskTodayRow; slot: string; score: number } | null = null;

  for (const task of pending) {
    const slots = task.pendingSlots.length ? task.pendingSlots : ['once'];
    for (const slot of slots) {
      const slotKey = slot as JourneyTaskSlot;
      const targetMin =
        slot === 'once'
          ? resolveSlotTargetMinutes('full_day', task.schedule, 1, 'before', profile)
          : resolveSlotTargetMinutes(
              slotKey,
              task.schedule,
              task.times_per_day,
              task.meal_timing,
              profile
            );
      const score = slotRelevanceScore(targetMin, nowMin);
      if (!best || score < best.score || (score === best.score && task.stepNumber < best.task.stepNumber)) {
        best = { task, slot, score };
      }
    }
  }

  if (!best) return null;

  const { task, slot } = best;
  const slotKey = slot as JourneyTaskSlot;
  const mealTim = task.schedule === 'per_meal' ? task.meal_timing : undefined;
  const slotLabelHe = slot === 'once' ? 'היום' : slotLabel(slotKey, mealTim);
  const currentSlot =
    slot !== 'once' ? currentSlotForSchedule(task.schedule, task.times_per_day, now) : null;
  const isNow = slot !== 'once' && slot === currentSlot;
  const timeHint = isNow ? `עכשיו · ${slotLabelHe}` : `הבאה · ${slotLabelHe}`;

  return {
    taskId: task.id,
    title: task.title,
    emoji: task.emoji,
    slot,
    slotLabelHe,
    timeHint,
  };
}
