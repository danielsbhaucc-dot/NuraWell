import { slotsForSchedule, slotLabel } from '@/lib/journey/task-schedule';
import type { UserScheduleProfile } from '@/lib/journey/profile-schedule';
import type { JourneyTaskSlot, MealTiming } from '@/lib/types/journey';
import type { ChallengeTaskDefinition } from './types';

const MEAL_TIMING_BY_TASK_KEY: Record<string, MealTiming> = {
  water_before_meals: 'before',
  walk_after_meal: 'after',
  protein_veg: 'during',
};

export type ChallengeTaskSlotView = {
  slot_key: string;
  label: string;
  meal_time: string | null;
  completed: boolean;
};

export function mealCountFromProfile(profile: UserScheduleProfile): number {
  const meals = profile.meal_schedule;
  if (Array.isArray(meals) && meals.length >= 1) {
    return Math.min(5, meals.length);
  }
  const c = profile.meal_count;
  if (typeof c === 'number' && c >= 1) return Math.min(5, Math.floor(c));
  return 3;
}

export function resolveTaskSlots(
  task: Pick<ChallengeTaskDefinition, 'task_key' | 'schedule_type'>,
  profile: UserScheduleProfile,
  completedSlotKeys: Set<string>,
): ChallengeTaskSlotView[] {
  if (task.schedule_type !== 'per_meal') return [];

  const count = mealCountFromProfile(profile);
  const journeySlots = slotsForSchedule('per_meal', count);
  const mealTiming = MEAL_TIMING_BY_TASK_KEY[task.task_key] ?? 'before';
  const meals = Array.isArray(profile.meal_schedule) ? profile.meal_schedule : [];

  return journeySlots.map((slotKey, idx) => ({
    slot_key: slotKey,
    label: slotLabel(slotKey as JourneyTaskSlot, mealTiming),
    meal_time: (meals[idx]?.time as string | null | undefined) ?? null,
    completed: completedSlotKeys.has(slotKey),
  }));
}

export function isPerMealTaskFullyComplete(slots: ChallengeTaskSlotView[]): boolean {
  return slots.length > 0 && slots.every((s) => s.completed);
}

export function mealTimingForTaskKey(taskKey: string): MealTiming {
  return MEAL_TIMING_BY_TASK_KEY[taskKey] ?? 'before';
}

export function countRequiredCompletionsForDay(
  tasks: Pick<ChallengeTaskDefinition, 'task_key' | 'schedule_type'>[],
  profile: UserScheduleProfile,
): number {
  let total = 0;
  for (const task of tasks) {
    if (task.schedule_type === 'per_meal') {
      total += resolveTaskSlots(task, profile, new Set()).length;
    } else {
      total += 1;
    }
  }
  return total;
}
