/**
 * קיבוץ התראות דומות (אותו הרגל / תובנת רגע) להצגה מרוכזת בפעמון.
 */

export type GroupableNotification = {
  id: string;
  title: string;
  body: string;
  is_read: boolean;
  created_at: string;
  source: string | null;
  habitIds: string[];
  habitTitles: string[];
};

export type NotificationListEntry<T extends GroupableNotification> =
  | { kind: 'single'; notification: T }
  | {
      kind: 'group';
      key: string;
      notifications: T[];
      /** כותרת מרוכזת, למשל "5 תובנות על שתיית מים" */
      groupTitle: string;
      /** גוף מההתראה האחרונה */
      previewBody: string;
      unreadCount: number;
      latestCreatedAt: string;
    };

function primaryHabitKey(n: GroupableNotification): string | null {
  if (n.source !== 'almog_habit_checkpoint') return null;
  const id = n.habitIds[0];
  return id && id.length > 0 ? id : null;
}

function habitLabel(n: GroupableNotification): string {
  const titled = n.habitTitles[0]?.trim();
  if (titled) return titled;
  // fallback עדין — לא להציג כותרת חתוכה באמצע מילה אם אין שם הרגל
  return 'ההרגל שלך';
}

/**
 * מקבץ התראות checkpoint על אותו הרגל (רצף כרונולוגי יורד כמו בתיבה).
 * קבוצה נוצרת רק כשיש ≥2 פריטים עם אותו habit id ראשי.
 */
export function groupSimilarNotifications<T extends GroupableNotification>(
  items: T[]
): NotificationListEntry<T>[] {
  const out: NotificationListEntry<T>[] = [];
  let i = 0;

  while (i < items.length) {
    const current = items[i]!;
    const key = primaryHabitKey(current);
    if (!key) {
      out.push({ kind: 'single', notification: current });
      i += 1;
      continue;
    }

    const cluster: T[] = [current];
    let j = i + 1;
    while (j < items.length) {
      const next = items[j]!;
      if (primaryHabitKey(next) !== key) break;
      cluster.push(next);
      j += 1;
    }

    if (cluster.length < 2) {
      out.push({ kind: 'single', notification: current });
      i += 1;
      continue;
    }

    const label = habitLabel(cluster[0]!);
    const unreadCount = cluster.filter((n) => !n.is_read).length;
    out.push({
      kind: 'group',
      key: `habit:${key}:${cluster.map((n) => n.id).join(',')}`,
      notifications: cluster,
      groupTitle: `${cluster.length} תובנות על ${label}`,
      previewBody: cluster[0]!.body,
      unreadCount,
      latestCreatedAt: cluster[0]!.created_at,
    });
    i = j;
  }

  return out;
}
