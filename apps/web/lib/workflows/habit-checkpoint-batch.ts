import type { AlmogHabitCheckpointPayload, HabitCheckpointSlot } from './almog-habit-checkpoint-payload';
import {
  filterHabitsForSlot,
  jerusalemCalendarParts,
  parseJourneyHabitsJson,
  type ParsedJourneyHabit,
} from './habit-checkpoint-eligibility';

type ProgressRow = {
  user_id: string;
  updated_at: string;
  is_completed: boolean | null;
  journey_steps: {
    title: string | null;
    habits: unknown;
    journey_stations: unknown;
  } | null;
};

function stationTitleFromJoin(raw: unknown): string | null {
  if (!raw) return null;
  if (Array.isArray(raw)) {
    const t = raw[0] && typeof raw[0] === 'object' ? (raw[0] as { title?: string }).title : undefined;
    return typeof t === 'string' ? t : null;
  }
  if (typeof raw === 'object' && 'title' in raw) {
    const t = (raw as { title?: unknown }).title;
    return typeof t === 'string' ? t : null;
  }
  return null;
}

/** הרגלים מצעדים שהושלמו + מכל הצעדים הפעילים (לא הושלמו) — לפי עדכון אחרון */
export function collectUserJourneyHabits(rows: ProgressRow[]): ParsedJourneyHabit[] {
  const byId = new Map<string, ParsedJourneyHabit>();

  for (const r of rows) {
    if (!r.journey_steps) continue;
    const habits = parseJourneyHabitsJson(r.journey_steps.habits);
    if (r.is_completed) {
      for (const h of habits) byId.set(h.id, h);
    }
  }

  const incomplete = [...rows]
    .filter((r) => !r.is_completed)
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

  for (const r of incomplete) {
    if (!r.journey_steps) continue;
    for (const h of parseJourneyHabitsJson(r.journey_steps.habits)) {
      byId.set(h.id, h);
    }
  }

  return [...byId.values()];
}

function pickDisplayRow(rows: ProgressRow[]): ProgressRow | null {
  const incomplete = [...rows]
    .filter((r) => !r.is_completed)
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  if (incomplete[0]) return incomplete[0];
  const sorted = [...rows].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );
  return sorted[0] ?? null;
}

export type HabitCheckpointPlanItem = {
  userId: string;
  payload: AlmogHabitCheckpointPayload;
};

/**
 * מחשב למי לשלוח בדיקה בחלון הנתון — ללא קריאות AI (רק נתונים).
 */
export function planHabitCheckpointTriggers(
  progressRows: ProgressRow[],
  slot: HabitCheckpointSlot,
  now: Date
): HabitCheckpointPlanItem[] {
  const { dateKey, weekday } = jerusalemCalendarParts(now);
  const byUser = new Map<string, ProgressRow[]>();

  for (const row of progressRows) {
    const uid = row.user_id;
    if (!byUser.has(uid)) byUser.set(uid, []);
    byUser.get(uid)!.push(row);
  }

  const out: HabitCheckpointPlanItem[] = [];

  for (const [userId, rows] of byUser) {
    const habits = collectUserJourneyHabits(rows);
    if (habits.length === 0) continue;

    const due = filterHabitsForSlot(habits, slot, weekday);
    if (due.length === 0) continue;

    const display = pickDisplayRow(rows);
    const stepTitle = display?.journey_steps?.title?.trim() ?? null;
    const stationTitle = stationTitleFromJoin(display?.journey_steps?.journey_stations);

    out.push({
      userId,
      payload: {
        userId,
        slot,
        checkpointDate: dateKey,
        habits: due.map((h) => ({
          id: h.id,
          title: h.title,
          frequency: h.frequency,
        })),
        stepTitle,
        stationTitle,
      },
    });
  }

  return out;
}
