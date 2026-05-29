/**
 * `getUsersForNotification(timeOfDay)` —
 * שולף את כל המועמדים לקבלת התראת engine ב-slot הזה.
 *
 * הזרימה (Supabase = source of truth):
 *   1. מביא את כל ה-profiles הפעילים (`is_active = true`) שיש להם
 *      `daily_task` (אחרת אין מה להזכיר להם).
 *   2. מסנן החוצה משתמשים שכבר השלימו את המשימה היום (`task_logs` עם
 *      `date_key = today_il`).
 *   3. מחשב לכל משתמש שנותר: `consecutiveMissedDays` (לפני היום),
 *      תוך scan של 14 הימים האחרונים מ-`task_logs`.
 *   4. מעביר ל-`deriveNotificationState` כדי לקבל NotificationState
 *      או null (לא לשלוח עכשיו).
 *   5. מחזיר רק מי שיש להם state פעיל.
 *
 * אופטימיזציה:
 *   • שאילתה אחת ל-profiles + שאילתה אחת ל-task_logs (last 14d לכל המשתמשים).
 *   • החישוב עצמו ב-memory (O(users × 14)).
 *
 * ❗ דחיית הכפילויות (לא לשלוח אותה התראה פעמיים באותו slot) נעשית
 *    ב-`logNotification` דרך UNIQUE constraint על
 *    (user_id, date_key, time_of_day) ב-notification_logs.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  deriveNotificationState,
  israelDateKey,
} from './derive-notification-state';
import type {
  NotificationCandidate,
  TimeOfDay,
} from '../../types/notification-state';
import { fetchLatestAiMemory } from './fetch-ai-memory';

const LOOKBACK_DAYS = 14;

interface ProfileRow {
  id: string;
  full_name: string | null;
  daily_task: string | null;
}

interface TaskLogRow {
  user_id: string;
  date_key: string;
}

function shiftDateKey(dateKey: string, deltaDays: number): string {
  const [y, m, d] = dateKey.split('-').map((n) => Number.parseInt(n, 10));
  if (![y, m, d].every(Number.isFinite)) return dateKey;
  // נשתמש ב-UTC כדי להימנע מהשפעת DST. שלוקח אופסט קטן זה לא משנה
  // כי אנחנו רק מייצרים מחרוזת YYYY-MM-DD תוך מעבר רציף של ימים.
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  const yyyy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function deriveFirstName(fullName: string | null | undefined): string {
  const trimmed = (fullName ?? '').trim();
  if (!trimmed) return 'חבר';
  return trimmed.split(/\s+/)[0] ?? 'חבר';
}

/**
 * סופר ימים *רצופים* (בדיוק לפני היום) שאין להם רישום ב-task_logs.
 * עוצר ברגע שמוצא יום אחד עם רישום.
 *
 * @param completedDates Set של `date_key`s שהיו בהם השלמות (חלון של LOOKBACK_DAYS).
 */
function countConsecutiveMissedDays(
  completedDates: ReadonlySet<string>,
  today: string
): number {
  let missed = 0;
  for (let delta = 1; delta <= LOOKBACK_DAYS; delta += 1) {
    const day = shiftDateKey(today, -delta);
    if (completedDates.has(day)) break;
    missed += 1;
  }
  return missed;
}

export interface GetUsersForNotificationOptions {
  /** Override ל-today (ירושלים) לצרכי טסטים. */
  todayOverride?: string;
  /** קייפ בטיחות: כמה משתמשים מקסימום להחזיר ב-batch. */
  maxUsers?: number;
}

export async function getUsersForNotification(
  admin: SupabaseClient,
  timeOfDay: TimeOfDay,
  options: GetUsersForNotificationOptions = {}
): Promise<NotificationCandidate[]> {
  const today = options.todayOverride ?? israelDateKey();
  const earliest = shiftDateKey(today, -LOOKBACK_DAYS);

  // 1. כל המשתמשים הפעילים עם משימה יומית מוגדרת.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const profilesQuery = (admin as any)
    .from('profiles')
    .select('id, full_name, daily_task')
    .eq('is_active', true)
    .not('daily_task', 'is', null);

  const { data: profilesData, error: profilesError } = (await profilesQuery) as {
    data: ProfileRow[] | null;
    error: { message: string } | null;
  };
  if (profilesError) {
    throw new Error(`getUsersForNotification(profiles): ${profilesError.message}`);
  }

  const profiles = (profilesData ?? []).filter(
    (p) => typeof p.daily_task === 'string' && p.daily_task.trim().length > 0
  );
  if (profiles.length === 0) return [];

  const userIds = profiles.map((p) => p.id);

  // 2. כל ה-task_logs ב-LOOKBACK_DAYS האחרונים לקבוצת המשתמשים.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const logsQuery = (admin as any)
    .from('task_logs')
    .select('user_id, date_key')
    .in('user_id', userIds)
    .gte('date_key', earliest)
    .lte('date_key', today);

  const { data: logsData, error: logsError } = (await logsQuery) as {
    data: TaskLogRow[] | null;
    error: { message: string } | null;
  };
  if (logsError) {
    throw new Error(`getUsersForNotification(task_logs): ${logsError.message}`);
  }

  // 3. group-by user → Set of date_keys
  const byUser = new Map<string, Set<string>>();
  for (const row of logsData ?? []) {
    if (!row?.user_id || !row?.date_key) continue;
    let set = byUser.get(row.user_id);
    if (!set) {
      set = new Set<string>();
      byUser.set(row.user_id, set);
    }
    set.add(row.date_key);
  }

  // 4. מסננים את מי שכבר השלים היום + מחשבים state
  const candidates: NotificationCandidate[] = [];
  for (const profile of profiles) {
    const completedDates = byUser.get(profile.id) ?? new Set<string>();
    if (completedDates.has(today)) continue; // ✅ השלים היום → דלג

    const consecutiveMissedDays = countConsecutiveMissedDays(completedDates, today);
    const state = deriveNotificationState({
      timeOfDay,
      consecutiveMissedDays,
    });
    if (!state) continue; // ה-rule engine החליט "לא עכשיו" (DAY_3 בנון/ערב, או DORMANT בלי יום ראשון)

    candidates.push({
      userId: profile.id,
      firstName: deriveFirstName(profile.full_name),
      taskName: (profile.daily_task as string).trim(),
      notificationState: state,
      consecutiveMissedDays,
      timeOfDay,
    });
  }

  const max = options.maxUsers ?? 500;
  const trimmed = candidates.slice(0, max);

  // 5. (Phase 3) הזרקת זיכרון ארוך-טווח: לכל מועמד — שולפים ב-batch אחד
  //    את ה-`latest_weekly_insight` וה-`latest_monthly_insight` שלו
  //    מ-`periodic_summaries`. כשל DB כאן לא קורס את ה-engine — נשלם
  //    תכף את ההתראה בלי הזיכרון (graceful degrade).
  if (trimmed.length > 0) {
    const memoryByUser = await fetchLatestAiMemory(
      admin,
      trimmed.map((c) => c.userId)
    );
    for (const candidate of trimmed) {
      const mem = memoryByUser.get(candidate.userId);
      if (mem && (mem.latest_weekly_insight || mem.latest_monthly_insight)) {
        candidate.aiMemory = mem;
      }
    }
  }

  return trimmed;
}
