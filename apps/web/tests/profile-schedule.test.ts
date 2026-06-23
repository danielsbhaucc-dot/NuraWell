import { describe, expect, it } from 'vitest';

import { resolveSlotTargetMinutes } from '../lib/journey/profile-schedule';
import { isMonthlyDayActive, isTaskActiveToday } from '../lib/journey/task-schedule';

describe('profile-schedule', () => {
  it('uses wake time for morning slot', () => {
    const mins = resolveSlotTargetMinutes('morning', 'multi_daily', 3, 'before', {
      wake_up_time: '06:00',
    });
    expect(mins).toBe(6 * 60 + 30);
  });

  it('applies admin meal offset on per_meal tasks', () => {
    const mins = resolveSlotTargetMinutes(
      'meal_lunch',
      'per_meal',
      3,
      'before',
      {
        meal_schedule: [{ time: '13:00', label: 'צהריים' }],
      },
      -45
    );
    expect(mins).toBe(13 * 60 - 45);
  });
});

describe('extended schedules', () => {
  it('quarterly active on correct months', () => {
    const d = new Date('2026-04-15T10:00:00+03:00');
    expect(isTaskActiveToday({ schedule: 'quarterly', monthly_day: 15 }, d)).toBe(true);
    const feb = new Date('2026-02-15T10:00:00+03:00');
    expect(isTaskActiveToday({ schedule: 'quarterly', monthly_day: 15 }, feb)).toBe(false);
  });

  it('custom interval every 7 days', () => {
    const d = new Date('2020-01-08T10:00:00+02:00');
    expect(isTaskActiveToday({ schedule: 'custom', interval_days: 7 }, d)).toBe(true);
  });

  it('monthly day match', () => {
    const d = new Date('2026-06-15T10:00:00+03:00');
    expect(isMonthlyDayActive(15, d)).toBe(true);
  });
});
