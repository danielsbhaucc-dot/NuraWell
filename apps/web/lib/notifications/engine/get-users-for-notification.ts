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
import { deriveUrgencyLevel } from './derive-urgency-level';
import type {
  NotificationCandidate,
  TimeOfDay,
} from '../../types/notification-state';
import { fetchLatestAiMemory } from './fetch-ai-memory';

const LOOKBACK_DAYS = 14;
/**
 * משתמש שהיה פעיל ב-`RESPONDED_RECENTLY_HOURS` השעות האחרונות מקבל "פטור"
 * מ-slot ההתראה הזה. ההיגיון: אם הוא הרגע כתב לאלמוג / סימן משימה, הוא
 * "בלולאה" — לדחוף לו עוד הודעת push זה רעש שיגרום לו לסלוד מהמערכת.
 * הערך נלקח ישירות מ"הנחיה 1" של Claude (`6 * 60 * 60 * 1000`).
 */
const RESPONDED_RECENTLY_HOURS = 6;

interface ProfileRow {
  id: string;
  full_name: string | null;
  daily_task: string | null;
  last_responded_at: string | null;
  notification_count: number | null;
}

interface TaskLogRow {
  user_id: string;
  date_key: string;
}

interface NotificationLogCountRow {
  user_id: string;
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
  // השדות `last_responded_at` ו-`notification_count` נוספו ב-migration 000029
  // ומאפשרים: (א) סינון של משתמשים שהגיבו לאחרונה, (ב) הזרקת counter ל-LLM.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const profilesQuery = admin
    .from('profiles')
    .select('id, full_name, daily_task, last_responded_at, notification_count')
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
  const logsQuery = admin
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

  // 3b. כמה התראות כבר נשלחו היום לכל משתמש (לפני ה-slot הנוכחי).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const notifLogsQuery = admin
    .from('notification_logs')
    .select('user_id')
    .in('user_id', userIds)
    .eq('date_key', today);

  const { data: notifLogsData, error: notifLogsError } = (await notifLogsQuery) as {
    data: NotificationLogCountRow[] | null;
    error: { message: string } | null;
  };
  if (notifLogsError) {
    throw new Error(
      `getUsersForNotification(notification_logs): ${notifLogsError.message}`
    );
  }

  const notificationsTodayByUser = new Map<string, number>();
  for (const row of notifLogsData ?? []) {
    if (!row?.user_id) continue;
    notificationsTodayByUser.set(
      row.user_id,
      (notificationsTodayByUser.get(row.user_id) ?? 0) + 1
    );
  }

  // 4. מסננים את מי שכבר השלים היום / הגיב לאחרונה + מחשבים state.
  const nowMs = Date.now();
  const respondedRecentlyMs = RESPONDED_RECENTLY_HOURS * 60 * 60 * 1000;

  const candidates: NotificationCandidate[] = [];
  for (const profile of profiles) {
    const completedDates = byUser.get(profile.id) ?? new Set<string>();
    if (completedDates.has(today)) continue; // ✅ השלים היום → דלג

    // ⏱️ Filter חדש: דלג אם המשתמש פעיל ב-6 השעות האחרונות (Claude #1).
    // ההיגיון: הוא בלולאה כרגע — תוסיף עוד push וזה ייקרא לו רעש, לא ליווי.
    let hoursSinceLastResponse: number | undefined;
    if (profile.last_responded_at) {
      const lastMs = Date.parse(profile.last_responded_at);
      if (Number.isFinite(lastMs)) {
        const diffMs = nowMs - lastMs;
        if (diffMs >= 0 && diffMs < respondedRecentlyMs) {
          continue; // 🔇 הגיב לאחרונה → השאר אותו במנוחה ל-slot הזה
        }
        if (diffMs >= 0) {
          hoursSinceLastResponse = Math.round(diffMs / (1000 * 60 * 60));
        }
      }
    }

    const consecutiveMissedDays = countConsecutiveMissedDays(completedDates, today);
    const state = deriveNotificationState({
      timeOfDay,
      consecutiveMissedDays,
    });
    if (!state) continue; // ה-rule engine החליט "לא עכשיו" (DAY_3 בנון/ערב, או DORMANT בלי יום ראשון)

    const notificationsTodaySent = notificationsTodayByUser.get(profile.id) ?? 0;

    const urgencyLevel = deriveUrgencyLevel({
      timeOfDay,
      consecutiveMissedDays,
      notificationsTodaySent,
    });

    const candidate: NotificationCandidate = {
      userId: profile.id,
      firstName: deriveFirstName(profile.full_name),
      taskName: (profile.daily_task as string).trim(),
      notificationState: state,
      consecutiveMissedDays,
      timeOfDay,
      urgencyLevel,
      notificationsTodaySent,
    };
    if (typeof hoursSinceLastResponse === 'number') {
      candidate.hoursSinceLastResponse = hoursSinceLastResponse;
    }
    if (typeof profile.notification_count === 'number' && profile.notification_count > 0) {
      candidate.notificationCount = profile.notification_count;
    }
    candidates.push(candidate);
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
