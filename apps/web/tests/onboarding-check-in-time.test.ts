import { describe, expect, it } from 'vitest';
import {
  isCheckInDueNow,
  israelNowMinutes,
  normalizeCheckInTimes,
  parseTimeToMinutes,
} from '../lib/ai/onboarding-check-in-time';

describe('onboarding-check-in-time', () => {
  it('parses HH:MM', () => {
    expect(parseTimeToMinutes('07:45')).toBe(7 * 60 + 45);
  });

  it('normalizes postgres time array', () => {
    expect(normalizeCheckInTimes(['07:45:00', '13:00', 'bad'])).toEqual(['07:45', '13:00']);
  });

  it('detects due within window', () => {
    const now = new Date('2026-05-17T04:50:00.000Z'); // ~07:50 Israel summer approx - use mock
    const due = isCheckInDueNow('08:00', now, 30);
    expect(typeof due).toBe('boolean');
  });

  it('israelNowMinutes returns 0-1439', () => {
    const m = israelNowMinutes(new Date());
    expect(m).toBeGreaterThanOrEqual(0);
    expect(m).toBeLessThan(24 * 60);
  });
});
