/**
 * שער שליחה משותף לכל מגע אלמוג שפונה למשתמש.
 *
 * הבטחת מוצר: עד 3 מגעים ביום (כולל presence / companion / check-in).
 * dedupe להרגלים דומים — לכל מקור שמציין habit_ids, לא רק habit-checkpoint.
 *
 * חריגים מכוונים (לא עוברים בשער זה):
 *  - SOS / guardian קריטי (almog_sos)
 *  - התראות אדמין / תמליל צ'אט ידני
 *  - ברוכים הבאים חד-פעמיים (welcome)
 *  - אתגר (challenge) — מסלול נפרד
 *  - סיכומים מערכתיים (summary-generator)
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { shouldSkipNotifyForTouchFatigue } from '../ai/almog-daily-context';
import { fetchTodayAlmogTouches } from '../ai/almog-notify-day-context';
import {
  hasRecentSimilarHabitNotification,
  type RecentHabitNotificationMeta,
} from './similar-habit-dedupe';

export type AlmogTouchSendGateReason = 'touch_fatigue' | 'similar_habit_recent';

export type AlmogTouchSendGate =
  | { ok: true }
  | { ok: false; reason: AlmogTouchSendGateReason };

export type GateAlmogUserFacingTouchOpts = {
  /** אם מסופק — בודקים dedupe להרגלים דומים בחלון ה-cooldown. */
  habitIds?: string[];
};

/**
 * שער קשיח לפני יצירת תוכן / insert — מניעה בצד שליחה, לא רק UI.
 */
export async function gateAlmogUserFacingTouch(
  admin: SupabaseClient,
  userId: string,
  opts: GateAlmogUserFacingTouchOpts = {}
): Promise<AlmogTouchSendGate> {
  const todayTouches = await fetchTodayAlmogTouches(admin, userId);
  // כולל presence — תקרת 3 מגעים ביום חלה על כל מגע משתמש-פונה.
  if (shouldSkipNotifyForTouchFatigue(todayTouches, 'remind')) {
    return { ok: false, reason: 'touch_fatigue' };
  }

  const habitIds = opts.habitIds?.filter((id) => typeof id === 'string' && id.length > 0) ?? [];
  if (habitIds.length === 0) return { ok: true };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: recent, error } = await admin
    .from('notifications')
    .select('metadata, created_at')
    .eq('user_id', userId)
    .eq('type', 'ai_message')
    .order('created_at', { ascending: false })
    .limit(40);

  if (error) {
    // כשל שאילתה → חוסמים (עדיף שקט מהצפה).
    return { ok: false, reason: 'similar_habit_recent' };
  }

  const recentForDedupe: RecentHabitNotificationMeta[] = (
    (recent ?? []) as Array<{ metadata?: unknown; created_at?: string }>
  ).map((row) => {
    const m = (row.metadata ?? null) as Record<string, unknown> | null;
    return {
      source: m?.source,
      habit_ids: m?.habit_ids,
      created_at: typeof row.created_at === 'string' ? row.created_at : undefined,
    };
  });

  if (hasRecentSimilarHabitNotification(recentForDedupe, habitIds)) {
    return { ok: false, reason: 'similar_habit_recent' };
  }

  return { ok: true };
}
