import { describe, expect, it } from 'vitest';
import { decideInactivityFade, isAutomaticTouch, parseNotificationPrefs } from '../lib/notifications/inactivity-fade';

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
  it('0–2 days inactive: no fade cap', () => {
    const last = now - 2.5 * D;
    expect(decideInactivityFade({ now, lastActiveAt: last, recentTouchTimes: [todayStart + H, todayStart + 2 * H], todayStartMs: todayStart })).toMatchObject({ ok: true, tier: 'active' });
  });
  it('3–5 days: up to 2 per day', () => {
    const last = now - 4 * D;
    expect(decideInactivityFade({ now, lastActiveAt: last, recentTouchTimes: [todayStart + H], todayStartMs: todayStart }).ok).toBe(true);
    expect(decideInactivityFade({ now, lastActiveAt: last, recentTouchTimes: [todayStart + H, todayStart + 2 * H], todayStartMs: todayStart }).ok).toBe(false);
  });
  it('6–13 days: once per day (yesterday does not block today)', () => {
    const last = now - 10 * D;
    expect(decideInactivityFade({ now, lastActiveAt: last, recentTouchTimes: [todayStart - 3 * H], todayStartMs: todayStart }).ok).toBe(true);
    expect(decideInactivityFade({ now, lastActiveAt: last, recentTouchTimes: [todayStart + H], todayStartMs: todayStart }).ok).toBe(false);
  });
  it('touches before the user went quiet are ignored', () => {
    const last = now - 3 * D;
    expect(decideInactivityFade({ now, lastActiveAt: last, recentTouchTimes: [last - H, last - 2 * H], todayStartMs: todayStart }).ok).toBe(true);
  });
  it('14–41 days: once per week', () => {
    const last = now - 20 * D;
    expect(decideInactivityFade({ now, lastActiveAt: last, recentTouchTimes: [now - 3 * D], todayStartMs: todayStart })).toMatchObject({ ok: false, tier: 'weekly' });
    expect(decideInactivityFade({ now, lastActiveAt: last, recentTouchTimes: [now - 8 * D], todayStartMs: todayStart })).toMatchObject({ ok: true, tier: 'weekly' });
  });
  it('42+ days (prod: 83 days, nudged every 3 days): once per 30 days', () => {
    const last = now - 83 * D;
    expect(decideInactivityFade({ now, lastActiveAt: last, recentTouchTimes: [now - 3 * D], todayStartMs: todayStart })).toMatchObject({ ok: false, tier: 'monthly' });
    expect(decideInactivityFade({ now, lastActiveAt: last, recentTouchTimes: [now - 31 * D], todayStartMs: todayStart })).toMatchObject({ ok: true, tier: 'monthly' });
  });
  it('every automatic source counts as a touch (cron_ops was invisible before)', () => {
    expect(isAutomaticTouch({ source: 'cron_ops' })).toBe(true);
    expect(isAutomaticTouch({ source: 'sos_followup' })).toBe(true);
    expect(isAutomaticTouch({ source: 'admin_transcript_delivery' })).toBe(false);
  });
});

describe('parseNotificationPrefs', () => {
  it('defaults to on; respects explicit false', () => {
    expect(parseNotificationPrefs(null)).toEqual({ push: true, email: true, daily_reminder: true });
    expect(parseNotificationPrefs({ push: false, daily_reminder: false })).toEqual({ push: false, email: true, daily_reminder: false });
  });
});
