import type { SupabaseClient } from '@supabase/supabase-js';

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
  if (p.role !== 'admin') return true;
  if (p.notify_test_opt_in === true) return true;
  return testUserIds.includes(String(p.id).toLowerCase());
}

/** PostgREST `.or()` filter: non-admin OR opted-in OR in env allowlist. */
export function notifyEligibleOrFilter(
  testUserIds: readonly string[] = parseNotifyTestUserIds(),
  opts: { withOptInColumn?: boolean } = {}
): string {
  const parts = ['role.neq.admin', 'role.is.null'];
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
