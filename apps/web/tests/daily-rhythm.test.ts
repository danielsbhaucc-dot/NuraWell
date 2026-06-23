import { describe, expect, it } from 'vitest';

import { resolveDailyRhythm, resolveSlotTargetMinutes } from '../lib/journey/daily-rhythm';
import { isMonthlyDayActive, isTaskActiveToday } from '../lib/journey/task-schedule';

describe('daily-rhythm', () => {
  it('uses custom morning slot from daily_rhythm', () => {
    const mins = resolveSlotTargetMinutes('morning', 'multi_daily', 3, 'before', {
      wake_up_time: '06:00',
      daily_rhythm: { morning: '09:15' },
    });
    expect(mins).toBe(9 * 60 + 15);
  });

  it('merges saved rhythm with defaults', () => {
    const rhythm = resolveDailyRhythm({
      wake_up_time: '07:00',
      sleep_time: '23:00',
      daily_rhythm: { noon: '14:30' },
    });
    expect(rhythm.noon).toBe('14:30');
    expect(rhythm.morning).toBeTruthy();
    expect(rhythm.evening).toBeTruthy();
  });
});

describe('monthly schedule', () => {
  it('is active on matching day of month', () => {
    const d = new Date('2026-06-15T10:00:00+03:00');
    expect(isMonthlyDayActive(15, d)).toBe(true);
    expect(isMonthlyDayActive(16, d)).toBe(false);
  });

  it('task active today for monthly schedule', () => {
    const d = new Date('2026-06-01T10:00:00+03:00');
    expect(isTaskActiveToday({ schedule: 'monthly', monthly_day: 1 }, d)).toBe(true);
    expect(isTaskActiveToday({ schedule: 'monthly', monthly_day: 2 }, d)).toBe(false);
  });
});
