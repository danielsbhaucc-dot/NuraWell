import { describe, expect, it } from 'vitest';

import {
  buildRiskFingerprintFromEvents,
  type RiskEvent,
} from '../lib/ai/risk-fingerprint-llm';
import { guardianSchedulesForToday, type RiskFingerprint } from '../lib/ai/risk-window';

function event(createdAt: string): RiskEvent {
  return { createdAt, trigger: 'emotional', source: 'sos' };
}

describe('risk fingerprint', () => {
  it('does not qualify 3 events from the same local date', () => {
    const fingerprint = buildRiskFingerprintFromEvents([
      event('2026-06-14T17:05:00.000Z'),
      event('2026-06-14T17:15:00.000Z'),
      event('2026-06-14T17:25:00.000Z'),
    ]);

    expect(fingerprint.windows).toHaveLength(0);
  });

  it('qualifies a recurring window only when events span distinct dates', () => {
    const fingerprint = buildRiskFingerprintFromEvents([
      event('2026-06-07T17:05:00.000Z'),
      event('2026-06-14T17:10:00.000Z'),
      event('2026-06-21T17:20:00.000Z'),
    ]);

    expect(fingerprint.windows).toHaveLength(1);
    expect(fingerprint.windows[0].confidence).toBeGreaterThanOrEqual(0.6);
    expect(fingerprint.windows[0].distinct_dates).toBe(3);
  });

  it('schedules today 30 minutes before a valid same-day risk window', () => {
    const fingerprint: RiskFingerprint = {
      windows: [
        {
          weekday: 1,
          start_hhmm: '20:00',
          duration_min: 60,
          trigger: 'emotional',
          confidence: 0.7,
          sample_size: 3,
          distinct_dates: 2,
        },
      ],
      helped_strategies: [],
      red_flag_at: null,
      ed_caution: false,
      computed_at: '2026-06-15T06:00:00.000Z',
      model: 'test',
    };

    const schedules = guardianSchedulesForToday(
      fingerprint,
      new Date('2026-06-15T06:00:00.000Z'),
      30
    );

    expect(schedules).toHaveLength(1);
    expect(schedules[0].windowStart.toISOString()).toBe('2026-06-15T17:00:00.000Z');
    expect(schedules[0].triggerAt.toISOString()).toBe('2026-06-15T16:30:00.000Z');
  });

  it('does not schedule low-spread windows even if sample size is 3', () => {
    const fingerprint: RiskFingerprint = {
      windows: [
        {
          weekday: 1,
          start_hhmm: '20:00',
          duration_min: 60,
          trigger: 'emotional',
          confidence: 0.7,
          sample_size: 3,
          distinct_dates: 1,
        },
      ],
      helped_strategies: [],
      red_flag_at: null,
      ed_caution: false,
      computed_at: '2026-06-15T06:00:00.000Z',
      model: 'test',
    };

    expect(guardianSchedulesForToday(fingerprint, new Date('2026-06-15T06:00:00.000Z'))).toHaveLength(0);
  });
});
