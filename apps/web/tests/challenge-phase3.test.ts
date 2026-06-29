import { describe, expect, it } from 'vitest';
import {
  computeChallengeEndDate,
  computeChallengeStartDate,
  jerusalemDateKeyFromDate,
} from '@/lib/challenge/start-date';
import {
  challengeRouteForPhase,
  resolveChallengePhase,
} from '@/lib/challenge/phase';
import {
  countPhraseHits,
  detectLanguageShift,
} from '@/lib/challenge/success-detectors';
import type { ChallengeEnrollment } from '@/lib/challenge/types';

function enrollment(overrides: Partial<ChallengeEnrollment> = {}): ChallengeEnrollment {
  const start = computeChallengeStartDate(new Date('2026-06-01T10:00:00+03:00'));
  const end = computeChallengeEndDate(start, 14);
  return {
    id: '1',
    user_id: 'u',
    campaign_id: 'c',
    registered_at: new Date().toISOString(),
    challenge_start_date: start,
    challenge_end_date: end,
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
    is_demo: false,
    demo_scenario: null,
    demo_simulated_day: null,
    metadata: {},
    ...overrides,
  };
}

describe('resolveChallengePhase wrap_up', () => {
  it('returns wrap_up after end date when wrap-up not seen', () => {
    const start = '2026-01-01';
    const end = '2026-01-14';
    const now = new Date('2026-01-20T12:00:00+02:00');
    expect(
      resolveChallengePhase(
        enrollment({
          challenge_start_date: start,
          challenge_end_date: end,
          wrap_up_seen_at: null,
        }),
        now,
      ),
    ).toBe('wrap_up');
  });

  it('returns completed after wrap-up seen', () => {
    const start = '2026-01-01';
    const end = '2026-01-14';
    const now = new Date('2026-01-20T12:00:00+02:00');
    expect(
      resolveChallengePhase(
        enrollment({
          challenge_start_date: start,
          challenge_end_date: end,
          wrap_up_seen_at: new Date().toISOString(),
        }),
        now,
      ),
    ).toBe('completed');
  });
});

describe('challengeRouteForPhase', () => {
  it('routes wrap_up to complete page', () => {
    expect(challengeRouteForPhase('wrap_up')).toBe('/challenge/complete');
  });
});

describe('detectLanguageShift', () => {
  it('detects positive shift vs negative baseline', () => {
    const result = detectLanguageShift({
      recentUserText:
        'היום ניסיתי לשמור על החלון ולא חיפשתי מתוק אחרי ארוחה. הרגשתי טוב עם עצמי.',
      baselineText: 'אני תמיד נכשל ואין לי כוח לעמוד בזה, זה מייאש.',
    });
    expect(result?.detected).toBe(true);
    expect(result?.title).toContain('שפה');
  });

  it('returns null for short messages', () => {
    expect(
      detectLanguageShift({
        recentUserText: 'כן',
        baselineText: 'נכשלתי',
      }),
    ).toBeNull();
  });
});

describe('countPhraseHits', () => {
  it('counts Hebrew phrase matches', () => {
    expect(countPhraseHits('הצלחתי וניסיתי', ['הצלחתי', 'נכשלתי'])).toBe(1);
  });
});
