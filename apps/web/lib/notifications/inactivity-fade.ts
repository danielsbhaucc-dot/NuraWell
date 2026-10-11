/**
 * Inactivity fade (Daniel's design) — keyed on the user's TRUE last activity.
 *
 *   active (inactive < 1 day)         → no fade limit (the normal rules apply, incl. open-task 3/day)
 *   inactive ≥ 1 day  (day 1)         → a single nudge that day
 *   inactive ≥ 2 days (day 2..week)   → at most once per day
 *   inactive ≥ ~1 week                → at most once per week
 *
 * Applied BEFORE the open-task 3/day touch-fatigue rule (gateAlmogUserFacingTouch).
 * Thresholds are constants so the product can tune them.
 */
export const FADE_DAILY_FROM_DAYS = 1;
export const FADE_WEEKLY_FROM_DAYS = 7;
export const FADE_WEEKLY_INTERVAL_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export type FadeDecision =
  | { ok: true; tier: 'active' | 'daily' | 'weekly'; inactiveDays: number }
  | { ok: false; tier: 'daily' | 'weekly'; inactiveDays: number; reason: 'inactivity_fade' };

/**
 * @param lastActiveAt  true last activity (max of last_active_at / last_responded_at); null = unknown → no fade
 * @param recentTouchTimes  Almog touch timestamps (ms), at least the last FADE_WEEKLY_INTERVAL_DAYS
 * @param todayStartMs  start of the user's local day (Asia/Jerusalem) in ms
 */
export function decideInactivityFade(params: {
  now: number;
  lastActiveAt: number | null;
  recentTouchTimes: number[];
  todayStartMs: number;
}): FadeDecision {
  const { now, lastActiveAt, recentTouchTimes, todayStartMs } = params;
  if (lastActiveAt == null || !Number.isFinite(lastActiveAt)) {
    return { ok: true, tier: 'active', inactiveDays: 0 };
  }
  const inactiveDays = Math.max(0, Math.floor((now - lastActiveAt) / DAY_MS));
  if (inactiveDays < FADE_DAILY_FROM_DAYS) return { ok: true, tier: 'active', inactiveDays };

  /** touches that happened after the user went quiet */
  const sinceQuiet = recentTouchTimes.filter((t) => t > lastActiveAt);

  if (inactiveDays >= FADE_WEEKLY_FROM_DAYS) {
    const windowStart = now - FADE_WEEKLY_INTERVAL_DAYS * DAY_MS;
    const sentThisWeek = sinceQuiet.some((t) => t >= windowStart);
    return sentThisWeek
      ? { ok: false, tier: 'weekly', inactiveDays, reason: 'inactivity_fade' }
      : { ok: true, tier: 'weekly', inactiveDays };
  }

  const sentToday = sinceQuiet.some((t) => t >= todayStartMs);
  return sentToday
    ? { ok: false, tier: 'daily', inactiveDays, reason: 'inactivity_fade' }
    : { ok: true, tier: 'daily', inactiveDays };
}

/** notification_prefs (profiles.notification_prefs, default {push,email,daily_reminder: true}) */
export type NotificationPrefs = { push: boolean; email: boolean; daily_reminder: boolean };

export function parseNotificationPrefs(raw: unknown): NotificationPrefs {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    push: o.push !== false,
    email: o.email !== false,
    daily_reminder: o.daily_reminder !== false,
  };
}
