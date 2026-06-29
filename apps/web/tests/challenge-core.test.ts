import { describe, expect, it } from 'vitest';
import { computeChallengeStartDate, countdownToDate, computeChallengeEndDate, jerusalemDateKeyFromDate } from '@/lib/challenge/start-date';
import { computeEatingWindow } from '@/lib/challenge/eating-window';
import { resolveChallengePhase } from '@/lib/challenge/phase';
import type { ChallengeEnrollment } from '@/lib/challenge/types';

describe('computeChallengeStartDate', () => {
  it('starts same Sunday before 15:00 Jerusalem', () => {
    const d = new Date('2026-06-28T09:00:00+03:00');
    expect(computeChallengeStartDate(d)).toBe('2026-06-28');
  });

  it('starts next Sunday after 15:00 on Sunday', () => {
    const d = new Date('2026-06-28T16:00:00+03:00');
    expect(computeChallengeStartDate(d)).toBe('2026-07-05');
  });

  it('starts next Sunday when registered on Monday', () => {
    const d = new Date('2026-06-29T10:00:00+03:00');
    expect(computeChallengeStartDate(d)).toBe('2026-07-05');
  });
});

describe('computeEatingWindow', () => {
  it('suggests earlier dinner when too close to sleep', () => {
    const result = computeEatingWindow({
      wakeUpTime: '07:00',
      sleepTime: '22:00',
      mealSchedule: [{ time: '08:00' }, { time: '13:00' }, { time: '21:00' }],
    });
    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(result.config.start).toBeTruthy();
    expect(result.config.end).toBeTruthy();
  });
});

describe('resolveChallengePhase demo', () => {
  const base: ChallengeEnrollment = {
    id: '1',
    user_id: 'u',
    campaign_id: 'c',
    registered_at: new Date().toISOString(),
    challenge_start_date: '2026-07-05',
    challenge_end_date: '2026-07-18',
    status: 'active',
    eating_window: null,
    intro_completed_at: null,
    interview_completed_at: null,
    is_demo: true,
    demo_scenario: 'intro',
    demo_simulated_day: null,
    metadata: {},
  };

  it('returns intro for demo intro scenario', () => {
    expect(resolveChallengePhase(base)).toBe('intro');
  });

  it('returns interview when eating window set but no interview', () => {
    const start = jerusalemDateKeyFromDate(new Date());
    const end = computeChallengeEndDate(start, 14);
    expect(
      resolveChallengePhase({
        ...base,
        is_demo: false,
        demo_scenario: null,
        intro_completed_at: new Date().toISOString(),
        eating_window: {
          start: '08:00',
          end: '20:00',
          last_meal_recommended: '20:00',
          sleep_buffer_minutes: 120,
          first_meal: '08:00',
          last_meal: '20:00',
        },
        challenge_start_date: start,
        challenge_end_date: end,
      }),
    ).toBe('interview');
  });
});
