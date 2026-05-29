/**
 * `fetchLatestAiMemory` — שליפה ב-batch של "תובנת השבוע/החודש האחרונה"
 * לכל מועמד ב-`getUsersForNotification`. שאילתה אחת לכל המשתמשים יחד,
 * במקום N שאילתות נפרדות (חיוני כדי לא להשהות את ה-cron).
 *
 * 📚 אסטרטגיה:
 *   • שולפים את כל סיכומי ה-`weekly` וה-`monthly` של 90 הימים האחרונים
 *     לקבוצת המשתמשים, ממוינים לפי `created_at DESC`.
 *   • הולכים ב-JS על השורות לפי הסדר; השורה הראשונה לכל (user, type) =
 *     האחרונה (כי ה-DB החזיר DESC). שאר השורות נדחות.
 *   • התוצאה: `Map<userId, AINotificationMemory>`.
 *
 * 🎯 גבולות בטיחות:
 *   • חלון 90 יום מבטיח תוצאות מוגבלות גם למשתמשים פעילים מאוד
 *     (~12 weekly + ~3 monthly ≈ 15 שורות לכל משתמש פעיל).
 *   • `limit = userIds.length × 30` שומר מ-runaway אם יש פתאום
 *     הרבה רישומים ביום אחד.
 *   • שגיאה ב-DB *לא זורקת* — מחזירה Map ריק. ההתראות ימשיכו לעבוד
 *     בלי הזיכרון (zero-regression: זה שדרוג, לא תלות).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AINotificationMemory } from '../../types/notification-state';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = SupabaseClient | any;

interface SummaryRow {
  user_id: string;
  type: 'weekly' | 'monthly';
  period_key: string;
  ai_insight: string | null;
}

/** חלון השליפה בימים. סיכומים ישנים יותר נחשבים "לא רלוונטיים" לזיכרון. */
const MEMORY_WINDOW_DAYS = 90;

/** כמה שורות מותר להחזיר פר משתמש. 30 ≫ 15 בפועל = הגנה בלבד. */
const ROWS_PER_USER_BUFFER = 30;

/**
 * שולף zero-or-many `weekly` + `monthly` insights פר user_id, ומחזיר
 * את האחרון של כל סוג. בטוח לקריאה גם כש-`userIds` ריק (no-op).
 */
export async function fetchLatestAiMemory(
  admin: AnySupabase,
  userIds: ReadonlyArray<string>
): Promise<Map<string, AINotificationMemory>> {
  const out = new Map<string, AINotificationMemory>();
  if (!userIds || userIds.length === 0) return out;

  const cutoffDate = new Date(Date.now() - MEMORY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const cutoffIso = cutoffDate.toISOString();
  const limit = userIds.length * ROWS_PER_USER_BUFFER;

  let rows: SummaryRow[] = [];
  try {
    const { data, error } = await admin
      .from('periodic_summaries')
      .select('user_id, type, period_key, ai_insight')
      .in('user_id', userIds as string[])
      .in('type', ['weekly', 'monthly'])
      .gte('created_at', cutoffIso)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      // eslint-disable-next-line no-console
      console.warn('[ai-memory] fetch failed (graceful degrade):', error.message ?? error);
      return out;
    }
    rows = (data ?? []) as SummaryRow[];
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      '[ai-memory] fetch threw (graceful degrade):',
      err instanceof Error ? err.message : err
    );
    return out;
  }

  // ה-DB החזיר DESC — הראשון לכל (user, type) הוא האחרון.
  for (const row of rows) {
    if (!row?.user_id || !row?.type) continue;
    const insight = (row.ai_insight ?? '').trim();
    if (!insight) continue;

    const existing = out.get(row.user_id) ?? {};
    if (row.type === 'weekly' && !existing.latest_weekly_insight) {
      existing.latest_weekly_insight = insight;
      existing.latest_weekly_period = row.period_key;
    } else if (row.type === 'monthly' && !existing.latest_monthly_insight) {
      existing.latest_monthly_insight = insight;
      existing.latest_monthly_period = row.period_key;
    }
    out.set(row.user_id, existing);
  }

  return out;
}
