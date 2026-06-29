import { describe, expect, it } from 'vitest';
import { isEatingWindowClosingSoon, getEatingWindowStatus } from '@/lib/challenge/eating-window-status';
import { resolveChallengePhase } from '@/lib/challenge/phase';
import type { ChallengeEnrollment } from '@/lib/challenge/types';

const baseEnrollment = (): ChallengeEnrollment => ({
  id: '1',
  user_id: 'u',
  campaign_id: 'c',
  registered_at: new Date().toISOString(),
  challenge_start_date: '2026-01-01',
  challenge_end_date: '2026-01-14',
  status: 'active',
  eating_window: {
    start: '08:00',
    end: '20:00',
    last_meal_recommended: '20:00',
    sleep_buffer_minutes: 120,
    first_meal: '08:00',
    last_meal: '20:00',
  },
  intro_completed_at: new Date().toISOString(),
  interview_completed_at: new Date().toISOString(),
  is_demo: true,
  demo_scenario: 'wrap_up',
  demo_simulated_day: 14,
  metadata: {},
});

describe('isEatingWindowClosingSoon', () => {
  it('true when 8 minutes before close', () => {
    const config = {
      start: '08:00',
      end: '20:00',
      last_meal_recommended: '20:00',
      sleep_buffer_minutes: 120,
      first_meal: '08:00',
      last_meal: '20:00',
    };
    const almostClose = new Date('2026-06-29T19:52:00+03:00');
    expect(isEatingWindowClosingSoon(config, almostClose, 10)).toBe(true);
  });
});

describe('demo wrap_up phase', () => {
  it('returns wrap_up for demo wrap_up scenario', () => {
    expect(resolveChallengePhase(baseEnrollment())).toBe('wrap_up');
  });
});

describe('getEatingWindowStatus open', () => {
  it('reports minutes until close', () => {
    const status = getEatingWindowStatus(
      {
        start: '08:00',
        end: '20:00',
        last_meal_recommended: '20:00',
        sleep_buffer_minutes: 120,
        first_meal: '08:00',
        last_meal: '20:00',
      },
      new Date('2026-06-29T15:00:00+03:00'),
    );
    expect(status.is_open).toBe(true);
    expect(status.minutes_until_close).toBe(5 * 60);
  });
});
