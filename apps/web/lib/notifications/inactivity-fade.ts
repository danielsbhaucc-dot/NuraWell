/**
 * Inactivity fade — the OUTER cap every automatic sender passes (evaluateNotifyGate), keyed on the
 * user's TRUE last activity. Aligned with the cadence stages of #127 (computeCadenceStage):
 *
 *   active            (0–2 days)   → no fade cap (the normal rules apply, incl. 3/day touch fatigue)
 *   dormant_early     (3–5 days)   → at most 2 per day
 *   withdrawing /
 *   extended_absence  (6–13 days)  → at most 1 per day
 *   ghosted           (14–41 days) → at most 1 per week
 *   dormant_long      (42+ days)   → at most 1 per 30 days
 *
 * Before 13.10.2026 this gate stopped at "weekly from day 7" and the master churn nudge was not
 * counted as a touch, so an 83-day inactive user got a nudge every 3 days.
 */
export const FADE_DAILY_FROM_DAYS = 3;
export const FADE_ONE_PER_DAY_FROM_DAYS = 6;
export const FADE_WEEKLY_FROM_DAYS = 14;
export const FADE_MONTHLY_FROM_DAYS = 42;
export const FADE_WEEKLY_INTERVAL_DAYS = 7;
export const FADE_MONTHLY_INTERVAL_DAYS = 30;
/** how far back the gate must look for previous touches */
export const FADE_LOOKBACK_DAYS = FADE_MONTHLY_INTERVAL_DAYS;

const DAY_MS = 24 * 60 * 60 * 1000;

export type FadeTier = 'active' | 'daily' | 'weekly' | 'monthly';

export type FadeDecision =
  | { ok: true; tier: FadeTier; inactiveDays: number }
  | { ok: false; tier: Exclude<FadeTier, 'active'>; inactiveDays: number; reason: 'inactivity_fade' };

/**
 * @param lastActiveAt  true last activity (max of last_active_at / last_responded_at); null = unknown → no fade
 * @param recentTouchTimes  automatic touch timestamps (ms), at least the last FADE_LOOKBACK_DAYS
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

  if (inactiveDays >= FADE_MONTHLY_FROM_DAYS) {
    const sent = sinceQuiet.some((t) => t >= now - FADE_MONTHLY_INTERVAL_DAYS * DAY_MS);
    return sent ? { ok: false, tier: 'monthly', inactiveDays, reason: 'inactivity_fade' } : { ok: true, tier: 'monthly', inactiveDays };
  }
  if (inactiveDays >= FADE_WEEKLY_FROM_DAYS) {
    const sent = sinceQuiet.some((t) => t >= now - FADE_WEEKLY_INTERVAL_DAYS * DAY_MS);
    return sent ? { ok: false, tier: 'weekly', inactiveDays, reason: 'inactivity_fade' } : { ok: true, tier: 'weekly', inactiveDays };
  }
  const perDay = inactiveDays >= FADE_ONE_PER_DAY_FROM_DAYS ? 1 : 2;
  const sentToday = sinceQuiet.filter((t) => t >= todayStartMs).length;
  return sentToday >= perDay
    ? { ok: false, tier: 'daily', inactiveDays, reason: 'inactivity_fade' }
    : { ok: true, tier: 'daily', inactiveDays };
}

/**
 * Which stored notifications count as an automatic "touch" for the fade. Everything Almog-ish
 * that the system sent on its own — not only sources prefixed "almog" (cron_ops, sos_followup,
 * guardian and summaries were invisible to the fade before).
 */
const NON_TOUCH_SOURCES = new Set(['admin_transcript_security', 'admin_transcript_delivery', 'almog_intro_welcome', 'task_completion_celebration']);
export function isAutomaticTouch(meta: Record<string, unknown> | null): boolean {
  const src = typeof meta?.source === 'string' ? meta.source : '';
  if (NON_TOUCH_SOURCES.has(src)) return false;
  return true;
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
