import { describe, expect, it } from 'vitest';
import {
  buildEncouragementReminder,
  MICRO_SUCCESS_DAYS_BEFORE_REACTIVATE,
  pickNextRecoveryReminderFireAt,
  RECOMMENDED_SUCCESS_WEEK_DAYS,
} from '../lib/ai/almog-commitments/recovery-plan-engine';

describe('recovery-plan-engine', () => {
  it('uses meal-slot timing for per_meal assignments', () => {
    const morning = new Date('2026-06-19T06:00:00.000Z');
    const fireAt = pickNextRecoveryReminderFireAt('daily', { journey_schedule: 'per_meal' }, morning);
    expect(new Date(fireAt).getTime()).toBeGreaterThan(morning.getTime());
  });

  it('builds easy encouragement for next meal', () => {
    const msg = buildEncouragementReminder('easy', 'לשתות כוס מים', 'daily', {
      journey_schedule: 'per_meal',
    });
    expect(msg.body).toContain('ארוחה הבאה');
    expect(msg.title).toContain('מעולה');
  });

  it('exports graduation constants', () => {
    expect(MICRO_SUCCESS_DAYS_BEFORE_REACTIVATE).toBe(3);
    expect(RECOMMENDED_SUCCESS_WEEK_DAYS).toBe(7);
  });
});
