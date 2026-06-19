/**
 * חישוב רצף ימי ביצוע — לוח ירושלים (משותף ל-UI ול-recovery-plan-engine).
 */

import { jerusalemDateKey } from './task-schedule';

type DoneEntry = { at: string; action: string };

export function consecutiveJerusalemDoneDays(
  history: DoneEntry[],
  now: Date = new Date()
): number {
  const doneDates = new Set<string>();
  for (const entry of history) {
    if (entry?.action === 'done' && entry.at) {
      doneDates.add(jerusalemDateKey(new Date(entry.at)));
    }
  }

  let streak = 0;
  const cursor = new Date(now.getTime());
  while (true) {
    const key = jerusalemDateKey(cursor);
    if (!doneDates.has(key)) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
