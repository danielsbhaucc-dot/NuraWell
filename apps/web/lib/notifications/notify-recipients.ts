import type { SupabaseClient } from '@supabase/supabase-js';
import { jerusalemTodayStartIso } from '@/lib/module-api/agent/lib-ai-almog-notify-day-context';
import {
  decideInactivityFade,
  FADE_DAILY_FROM_DAYS,
  FADE_LOOKBACK_DAYS,
  isAutomaticTouch,
  parseNotificationPrefs,
  type NotificationPrefs,
} from './inactivity-fade';

/**
 * מי מקבל התראות אוטומטיות (cron / מערכת חוסר-פעילות).
 *
 * - משתמשים רגילים (role='user') — תמיד.
 * - אדמינים — לא, *אלא אם* סומנו כמשתמש בדיקה:
 *     1. profiles.notify_test_opt_in = true   (migration 000088), או
 *     2. env NOTIFY_TEST_USER_IDS="uuid1,uuid2".
 * Demo enrollments (challenge_enrollments.is_demo) כבר מסוננים בנפרד.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseNotifyTestUserIds(raw: string | undefined | null = process.env.NOTIFY_TEST_USER_IDS): string[] {
  if (!raw) return [];
  return [
    ...new Set(
      raw
        .split(/[\s,;]+/)
        .map((s) => s.trim().toLowerCase())
        .filter((s) => UUID_RE.test(s))
    ),
  ];
}

export type NotifyProfileLike = {
  id: string;
  role?: string | null;
  notify_test_opt_in?: boolean | null;
};

export function isNotifyEligibleProfile(
  p: NotifyProfileLike,
  testUserIds: readonly string[] = parseNotifyTestUserIds()
): boolean {
  // real users only; admin + 'test' (e2e) accounts need explicit opt-in
  if (!p.role || p.role === 'user') return true;
  if (p.notify_test_opt_in === true) return true;
  return testUserIds.includes(String(p.id).toLowerCase());
}

/** PostgREST `.or()` filter: regular user OR opted-in OR in env allowlist (admin/test excluded). */
export function notifyEligibleOrFilter(
  testUserIds: readonly string[] = parseNotifyTestUserIds(),
  opts: { withOptInColumn?: boolean } = {}
): string {
  const parts = ['role.eq.user', 'role.is.null'];
  if (opts.withOptInColumn !== false) parts.push('notify_test_opt_in.eq.true');
  if (testUserIds.length > 0) parts.push(`id.in.(${testUserIds.join(',')})`);
  return parts.join(',');
}

function isMissingColumnError(err: { message?: string; code?: string } | null): boolean {
  if (!err) return false;
  return err.code === '42703' || /notify_test_opt_in/.test(err.message ?? '');
}

type ProfilesQuery = ReturnType<ReturnType<SupabaseClient['from']>['select']>;

/**
 * count של פרופילים זכאים להתראות (head-only, ללא שורות). -1 בשגיאה.
 * עמיד לסביבה שבה migration 000088 עוד לא רצה.
 */
export async function countNotifyEligibleProfiles(
  admin: SupabaseClient,
  apply: (q: ProfilesQuery) => ProfilesQuery = (q) => q
): Promise<number> {
  const ids = parseNotifyTestUserIds();
  for (const withOptInColumn of [true, false]) {
    const base = admin.from('profiles').select('id', { count: 'exact', head: true }) as ProfilesQuery;
    const { count, error } = await apply(base).or(notifyEligibleOrFilter(ids, { withOptInColumn }));
    if (!error) return count ?? 0;
    if (!(withOptInColumn && isMissingColumnError(error))) {
      console.warn('[notify-recipients] count failed', error.message);
      return -1;
    }
  }
  return -1;
}

/**
 * מסנן רשימת user ids לזכאים בלבד — שאילתה אחת, מחזירה רק `id`.
 * בשגיאה מחזיר את הרשימה המקורית (fail-open = אותה התנהגות כמו קודם).
 */
export async function filterNotifyEligibleUserIds(
  admin: SupabaseClient,
  userIds: readonly string[]
): Promise<string[]> {
  if (userIds.length === 0) return [];
  const testIds = parseNotifyTestUserIds();
  const out = new Set<string>();
  const CHUNK = 500;
  for (let i = 0; i < userIds.length; i += CHUNK) {
    const chunk = userIds.slice(i, i + CHUNK);
    let rows: NotifyProfileLike[] | null = null;
    for (const select of ['id, role, notify_test_opt_in', 'id, role']) {
      const { data, error } = await admin.from('profiles').select(select).in('id', chunk);
      if (!error) {
        rows = (data ?? []) as unknown as NotifyProfileLike[];
        break;
      }
      if (!isMissingColumnError(error)) {
        console.warn('[notify-recipients] filter failed — fail-open', error.message);
        return [...userIds];
      }
    }
    for (const r of rows ?? []) if (isNotifyEligibleProfile(r, testIds)) out.add(r.id);
  }
  return userIds.filter((id) => out.has(id));
}

/** בדיקה לפני שליחה למשתמש בודד. fail-open (כמו קודם) בשגיאה. */
export async function isUserNotifyEligible(admin: SupabaseClient, userId: string): Promise<boolean> {
  const ids = await filterNotifyEligibleUserIds(admin, [userId]);
  return ids.length > 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Single per-user send gate (recipient + prefs + inactivity fade).
// Used by gateAlmogUserFacingTouch (all Almog senders) BEFORE touch-fatigue (3/day).
// ─────────────────────────────────────────────────────────────────────────────

export type NotifyGateReason = 'not_notify_recipient' | 'prefs_off' | 'inactivity_fade' | 'safety_pause';
export type NotifyGateResult =
  | { ok: true; inactiveDays: number; tier: 'active' | 'daily' | 'weekly' | 'monthly'; prefs: NotificationPrefs }
  | { ok: false; reason: NotifyGateReason; inactiveDays?: number };

type GateProfileRow = NotifyProfileLike & {
  notification_prefs?: unknown;
  last_active_at?: string | null;
  last_responded_at?: string | null;
};

function toMs(v: string | null | undefined): number | null {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

export async function evaluateNotifyGate(
  admin: SupabaseClient,
  userId: string,
  opts: { now?: Date; isAlmogTouch?: (meta: Record<string, unknown> | null) => boolean } = {}
): Promise<NotifyGateResult> {
  const now = opts.now ?? new Date();
  let row: GateProfileRow | null = null;
  for (const select of [
    'id, role, notify_test_opt_in, notification_prefs, last_active_at, last_responded_at, notify_paused_until',
    'id, role, notification_prefs, last_active_at, last_responded_at',
  ]) {
    const { data, error } = await admin.from('profiles').select(select).eq('id', userId).maybeSingle();
    if (!error) {
      row = (data ?? null) as unknown as GateProfileRow | null;
      break;
    }
    if (!isMissingColumnError(error)) {
      console.warn('[notify-gate] profile lookup failed — fail-open', error.message);
      return { ok: true, inactiveDays: 0, tier: 'active', prefs: parseNotificationPrefs(null) };
    }
  }
  if (!row) return { ok: false, reason: 'not_notify_recipient' };
  if (!isNotifyEligibleProfile(row)) return { ok: false, reason: 'not_notify_recipient' };

  // crisis safety pause (lib/safety/record-crisis.ts): no automatic nudges while paused
  const pausedUntil = toMs((row as { notify_paused_until?: string | null }).notify_paused_until);
  if (pausedUntil != null && pausedUntil > now.getTime()) return { ok: false, reason: 'safety_pause' };

  const prefs = parseNotificationPrefs(row.notification_prefs);
  if (!prefs.daily_reminder) return { ok: false, reason: 'prefs_off' };

  const lastA = toMs(row.last_active_at);
  const lastR = toMs(row.last_responded_at);
  const lastActive = lastA == null && lastR == null ? null : Math.max(lastA ?? 0, lastR ?? 0);

  let touchTimes: number[] = [];
  const nowMs = now.getTime();
  if (lastActive != null && nowMs - lastActive >= FADE_DAILY_FROM_DAYS * 24 * 3600 * 1000) {
    const since = new Date(Math.max(lastActive, nowMs - FADE_LOOKBACK_DAYS * 24 * 3600 * 1000)).toISOString();
    const { data, error } = await admin
      .from('notifications')
      .select('created_at, metadata')
      .eq('user_id', userId)
      .eq('type', 'ai_message')
      .gt('created_at', since)
      .limit(50);
    if (error) {
      // fail-closed for fade (prefer silence over flooding an inactive user)
      return { ok: false, reason: 'inactivity_fade' };
    }
    const isAlmog = opts.isAlmogTouch ?? isAutomaticTouch;
    touchTimes = ((data ?? []) as Array<{ created_at: string; metadata: unknown }>)
      .filter((r) => isAlmog((r.metadata ?? null) as Record<string, unknown> | null))
      .map((r) => Date.parse(r.created_at))
      .filter((t) => Number.isFinite(t));
  }

  const fade = decideInactivityFade({
    now: nowMs,
    lastActiveAt: lastActive,
    recentTouchTimes: touchTimes,
    todayStartMs: Date.parse(jerusalemTodayStartIso(now)),
  });
  if (!fade.ok) return { ok: false, reason: 'inactivity_fade', inactiveDays: fade.inactiveDays };
  return { ok: true, inactiveDays: fade.inactiveDays, tier: fade.tier, prefs };
}
