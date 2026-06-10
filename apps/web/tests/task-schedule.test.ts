import { describe, expect, it } from 'vitest';

import {
  isSlotCompleted,
  resolveTaskSchedule,
  slotsForSchedule,
} from '../lib/journey/task-schedule';
import { inferSlotFromUserMessage as inferFromChat } from '../lib/ai/mark-task-execution';

describe('task-schedule', () => {
  it('resolves multi_daily default to 3 times', () => {
    const r = resolveTaskSchedule({ schedule: 'multi_daily' });
    expect(r.times_per_day).toBe(3);
    expect(slotsForSchedule(r.schedule, r.times_per_day)).toEqual(['morning', 'noon', 'evening']);
  });

  it('per_meal with 3 times maps to meal slots', () => {
    const slots = slotsForSchedule('per_meal', 3);
    expect(slots).toEqual(['meal_breakfast', 'meal_lunch', 'meal_dinner']);
  });

  it('per_meal with 5 times includes snack meal slots', () => {
    const slots = slotsForSchedule('per_meal', 5);
    expect(slots).toEqual([
      'meal_breakfast',
      'meal_snack_morning',
      'meal_lunch',
      'meal_snack_evening',
      'meal_dinner',
    ]);
  });

  it('tracks slot completion per day', () => {
    const execs = [
      { task_id: 't1', date_key: '2026-05-20', slot: 'morning' as const },
      { task_id: 't1', date_key: '2026-05-20', slot: 'noon' as const },
    ];
    expect(isSlotCompleted(execs, 't1', '2026-05-20', 'morning')).toBe(true);
    expect(isSlotCompleted(execs, 't1', '2026-05-20', 'evening')).toBe(false);
  });
});

describe('inferSlotFromUserMessage (chat)', () => {
  it('detects morning for per_meal', () => {
    expect(
      inferFromChat('שתיתי לפני ארוחת בוקר', 'per_meal', 3)
    ).toBe('meal_breakfast');
  });

  it('detects evening for multi_daily', () => {
    expect(inferFromChat('עשיתי לפני ערב', 'multi_daily', 3)).toBe('evening');
  });
});
