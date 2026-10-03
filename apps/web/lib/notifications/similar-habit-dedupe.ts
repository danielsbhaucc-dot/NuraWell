/**
 * מניעת הצפת התראות כמעט-זהות על אותו הרגל בחלון זמן קצר.
 */

export const SIMILAR_HABIT_COOLDOWN_MS = 2 * 60 * 60 * 1000; // 2 שעות — חוסם הצפה, לא את 3 החלונות

export type RecentHabitNotificationMeta = {
  source?: unknown;
  habit_ids?: unknown;
  created_at?: string;
};

function asStringIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === 'string' && x.length > 0);
}

/**
 * האם יש התראת habit-checkpoint אחרונה על לפחות אחד מההרגלים בחלון ה-cooldown.
 * לא בודק את אותו slot+תאריך (זה מטופל ב-already_sent_this_slot).
 */
export function hasRecentSimilarHabitNotification(
  recent: RecentHabitNotificationMeta[],
  habitIds: string[],
  nowMs: number = Date.now(),
  cooldownMs: number = SIMILAR_HABIT_COOLDOWN_MS
): boolean {
  if (habitIds.length === 0) return false;
  const wanted = new Set(habitIds);
  const cutoff = nowMs - cooldownMs;

  for (const row of recent) {
    if (row.source !== 'almog_habit_checkpoint' && row.source !== 'almog_churn_survey') {
      continue;
    }
    const ids = asStringIds(row.habit_ids);
    if (ids.length === 0) continue;
    const createdMs =
      typeof row.created_at === 'string' ? Date.parse(row.created_at) : Number.NaN;
    if (!Number.isFinite(createdMs) || createdMs < cutoff) continue;
    if (ids.some((id) => wanted.has(id))) return true;
  }
  return false;
}
