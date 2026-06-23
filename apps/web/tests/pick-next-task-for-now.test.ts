import { describe, expect, it } from 'vitest';

import { buildTaskTimeHint, pickNextTaskForNow } from '../lib/journey/pick-next-task-for-now';
import type { PendingTaskTodayRow } from '../lib/journey/journey-report-parse';

function row(
  partial: Partial<PendingTaskTodayRow> & Pick<PendingTaskTodayRow, 'id' | 'title'>
): PendingTaskTodayRow {
  return {
    stepId: 's1',
    emoji: '✅',
    stepTitle: 'שלב',
    stepNumber: 1,
    pendingSlots: ['morning'],
    done: false,
    schedule: 'multi_daily',
    times_per_day: 3,
    weekly_day: 0,
    monthly_day: 1,
    interval_days: 7,
    meal_offset_minutes: null,
    meal_timing: 'before',
    meal_target: 'fixed',
    ...partial,
  };
}

describe('pickNextTaskForNow', () => {
  it('prefers morning slot in the morning', () => {
    const morning = new Date('2026-06-23T05:30:00+03:00');
    const tasks = [
      row({
        id: 'a',
        title: 'ערב',
        pendingSlots: ['evening'],
        schedule: 'multi_daily',
        times_per_day: 2,
      }),
      row({ id: 'b', title: 'בוקר', pendingSlots: ['morning'] }),
    ];
    const pick = pickNextTaskForNow(tasks, { wake_up_time: '06:30' }, morning);
    expect(pick?.taskId).toBe('b');
    expect(pick?.slot).toBe('morning');
  });

  it('uses meal schedule for per_meal tasks', () => {
    const noon = new Date('2026-06-23T12:30:00+03:00');
    const tasks = [
      row({
        id: 'meal',
        title: 'לפני ארוחה',
        pendingSlots: ['meal_lunch'],
        schedule: 'per_meal',
        times_per_day: 3,
      }),
    ];
    const pick = pickNextTaskForNow(
      tasks,
      {
        meal_schedule: [
          { time: '07:30', label: 'בוקר' },
          { time: '13:00', label: 'צהריים' },
          { time: '19:30', label: 'ערב' },
        ],
      },
      noon
    );
    expect(pick?.taskId).toBe('meal');
    expect(pick?.slot).toBe('meal_lunch');
  });

  it('uses clear time hints instead of ambiguous הבאה', () => {
    const morning = new Date('2026-06-23T05:30:00+03:00');
    const task = row({ id: 'a', title: 'בוקר', pendingSlots: ['morning'] });
    const nowHint = buildTaskTimeHint('morning', 'בוקר', task, { wake_up_time: '06:30' }, morning);
    expect(nowHint).toContain('עכשיו');

    const evening = new Date('2026-06-23T20:30:00+03:00');
    const eveningTask = row({
      id: 'b',
      title: 'ערב',
      pendingSlots: ['evening'],
      schedule: 'multi_daily',
      times_per_day: 2,
    });
    const futureHint = buildTaskTimeHint(
      'evening',
      'ערב',
      eveningTask,
      { wake_up_time: '06:30', sleep_time: '22:30' },
      morning
    );
    expect(futureHint).toContain('מועד הבא');
    expect(futureHint).not.toContain('הבאה');
  });
});
