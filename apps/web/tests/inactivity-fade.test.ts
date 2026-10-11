import { describe, expect, it } from 'vitest';
import { decideInactivityFade, parseNotificationPrefs } from '../lib/notifications/inactivity-fade';

const H = 3600_000;
const D = 24 * H;
const now = Date.parse('2026-10-11T12:00:00Z');
const todayStart = Date.parse('2026-10-10T21:00:00Z'); // 00:00 Israel

describe('decideInactivityFade', () => {
  it('active user: no fade', () => {
    expect(decideInactivityFade({ now, lastActiveAt: now - 5 * H, recentTouchTimes: [now - H, now - 2 * H], todayStartMs: todayStart }).ok).toBe(true);
  });
  it('unknown last activity: no fade', () => {
    expect(decideInactivityFade({ now, lastActiveAt: null, recentTouchTimes: [], todayStartMs: todayStart }).ok).toBe(true);
  });
  it('day 1 inactive: one nudge, then blocked that day', () => {
    const last = now - 1.2 * D;
    expect(decideInactivityFade({ now, lastActiveAt: last, recentTouchTimes: [], todayStartMs: todayStart })).toMatchObject({ ok: true, tier: 'daily' });
    expect(decideInactivityFade({ now, lastActiveAt: last, recentTouchTimes: [todayStart + H], todayStartMs: todayStart })).toMatchObject({ ok: false, reason: 'inactivity_fade' });
  });
  it('day 2..6: once per day (yesterday touch does not block today)', () => {
    const last = now - 4 * D;
    expect(decideInactivityFade({ now, lastActiveAt: last, recentTouchTimes: [todayStart - 3 * H], todayStartMs: todayStart }).ok).toBe(true);
  });
  it('touches before the user went quiet are ignored', () => {
    const last = now - 3 * D;
    expect(decideInactivityFade({ now, lastActiveAt: last, recentTouchTimes: [last - H], todayStartMs: todayStart }).ok).toBe(true);
  });
  it('a week+ inactive: once per week', () => {
    const last = now - 10 * D;
    expect(decideInactivityFade({ now, lastActiveAt: last, recentTouchTimes: [now - 3 * D], todayStartMs: todayStart })).toMatchObject({ ok: false, tier: 'weekly' });
    expect(decideInactivityFade({ now, lastActiveAt: last, recentTouchTimes: [now - 8 * D], todayStartMs: todayStart })).toMatchObject({ ok: true, tier: 'weekly' });
  });
});

describe('parseNotificationPrefs', () => {
  it('defaults to on; respects explicit false', () => {
    expect(parseNotificationPrefs(null)).toEqual({ push: true, email: true, daily_reminder: true });
    expect(parseNotificationPrefs({ push: false, daily_reminder: false })).toEqual({ push: false, email: true, daily_reminder: false });
  });
});
