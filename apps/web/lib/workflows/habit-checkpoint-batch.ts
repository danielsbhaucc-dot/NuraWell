import type {
  AlmogHabitCheckpointPayload,
  HabitCheckpointSlot,
} from './almog-habit-checkpoint-payload';
import {
  fetchUserIdsWithChatToday,
  mergeHabitsDoneTodayFromRows,
} from '../ai/almog-daily-context';
import {
  filterHabitsForSlot,
  jerusalemCalendarParts,
  parseJourneyHabitsJson,
  type ParsedJourneyHabit,
} from './habit-checkpoint-eligibility';

/**
 * שדות לקריאה מ-journey_progress + מ-journey_steps לחישוב התראות.
 * הוסיפו `tasks` ו-`task_statuses` כדי לזהות משימות שהמשתמש קיבל אבל לא ביצע.
 */
export type ProgressRow = {
  user_id: string;
  updated_at: string;
  is_completed: boolean | null;
  task_statuses: unknown;
  habits_progress: unknown;
  journey_steps: {
    title: string | null;
    habits: unknown;
    tasks: unknown;
    journey_stations: unknown;
  } | null;
};

type ParsedTask = { id: string; title: string };

type TaskStatusEntry = {
  status?: unknown;
  execution_done?: unknown;
};

function parseJourneyTasksJson(raw: unknown): ParsedTask[] {
  if (!Array.isArray(raw)) return [];
  const out: ParsedTask[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const id = typeof row.id === 'string' ? row.id : '';
    const title = typeof row.title === 'string' ? row.title : '';
    if (!id || !title) continue;
    out.push({ id, title });
  }
  return out;
}

function asStatusMap(raw: unknown): Record<string, TaskStatusEntry> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as Record<string, TaskStatusEntry>;
}

/**
 * מזהה משימות שהמשתמש סימן `accepted` ועדיין `execution_done !== true`.
 * סורק את כל הצעדים שהמשתמש עבר/נמצא בהם — לא רק את הצעד האחרון.
 * ללא מגבלת מספר פריטים — מחזיר את כל המשימות הפתוחות.
 * מסודר לפי updated_at של ה-row כך שמשימות מהצעד האחרון מופיעות ראשונות.
 */
export function collectPendingAcceptedTasks(
  rows: ProgressRow[]
): Array<{ id: string; title: string; stepTitle: string | null }> {
  const seen = new Set<string>();
  const out: Array<{ id: string; title: string; stepTitle: string | null }> = [];

  const sortedByRecent = [...rows].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );

  for (const r of sortedByRecent) {
    if (!r.journey_steps) continue;
    const tasks = parseJourneyTasksJson(r.journey_steps.tasks);
    if (tasks.length === 0) continue;
    const statuses = asStatusMap(r.task_statuses);
    const stepTitle = r.journey_steps.title?.trim() ?? null;
    for (const t of tasks) {
      if (seen.has(t.id)) continue;
      const s = statuses[t.id];
      if (!s) continue;
      if (s.status !== 'accepted') continue;
      if (s.execution_done === true) continue;
      seen.add(t.id);
      out.push({ id: t.id, title: t.title, stepTitle });
    }
  }

  return out;
}

/** משימות שסומנו accepted + execution_done — מקור האמת לפני Cron. */
export function collectCompletedAcceptedTasks(
  rows: ProgressRow[]
): Array<{ id: string; title: string }> {
  const seen = new Set<string>();
  const out: Array<{ id: string; title: string }> = [];

  const sortedByRecent = [...rows].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );

  for (const r of sortedByRecent) {
    if (!r.journey_steps) continue;
    const tasks = parseJourneyTasksJson(r.journey_steps.tasks);
    if (tasks.length === 0) continue;
    const statuses = asStatusMap(r.task_statuses);
    for (const t of tasks) {
      if (seen.has(t.id)) continue;
      const s = statuses[t.id];
      if (!s || s.status !== 'accepted' || s.execution_done !== true) continue;
      seen.add(t.id);
      out.push({ id: t.id, title: t.title });
    }
  }

  return out;
}

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
 *
 * מדלג על משתמש אם:
 *  - אין לו הרגלים תואמי slot באותו יום, **וגם**
 *  - אין לו משימות שהוא סימן כ-accepted אבל עדיין לא דיווח על ביצוע.
 *
 * מי שיש לו משימות פתוחות יקבל התראה גם בלי הרגלים תואמי slot — האחריות
 * של הזרימה הזו היא לעודד למלא את מה שכבר הסכים לו.
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
    const slotHabits = habits.length > 0 ? filterHabitsForSlot(habits, slot, weekday) : [];
    const habitsDoneToday = mergeHabitsDoneTodayFromRows(rows);
    const due = slotHabits.filter((h) => !habitsDoneToday.has(h.id));
    const completedTodayHabits = habits
      .filter((h) => habitsDoneToday.has(h.id))
      .map((h) => ({ id: h.id, title: h.title }));

    const pendingTasks = collectPendingAcceptedTasks(rows);
    const completedTodayTasks = collectCompletedAcceptedTasks(rows);

    const hasRemindWork = due.length > 0 || pendingTasks.length > 0;
    const hasReinforceCompletion =
      !hasRemindWork && (completedTodayHabits.length > 0 || completedTodayTasks.length > 0);

    if (!hasRemindWork && !hasReinforceCompletion) continue;

    const display = pickDisplayRow(rows);
    const stepTitle = display?.journey_steps?.title?.trim() ?? null;
    const stationTitle = stationTitleFromJoin(display?.journey_steps?.journey_stations);

    out.push({
      userId,
      payload: {
        userId,
        slot,
        checkpointDate: dateKey,
        notifyMode: hasRemindWork ? 'remind' : 'reinforce',
        reinforceKind: hasRemindWork ? undefined : 'completion',
        habits: due.map((h) => ({
          id: h.id,
          title: h.title,
          frequency: h.frequency,
        })),
        pendingTasks: pendingTasks.map((t) => ({
          id: t.id,
          title: t.title,
          stepTitle: t.stepTitle,
        })),
        completedTodayHabits,
        completedTodayTasks,
        stepTitle,
        stationTitle,
      },
    });
  }

  return out;
}

/**
 * חיזוק נוכחות: דיברו בצ'אט היום, אין תזכורת פתוחה — מגע חברי (לא גנרי).
 */
export function appendPresenceReinforceFromChat(
  plan: HabitCheckpointPlanItem[],
  progressRows: ProgressRow[],
  slot: HabitCheckpointSlot,
  now: Date,
  chatUserIds: Set<string>
): HabitCheckpointPlanItem[] {
  if (chatUserIds.size === 0) return plan;

  const { dateKey, weekday } = jerusalemCalendarParts(now);
  const planned = new Set(plan.map((p) => p.userId));
  const byUser = new Map<string, ProgressRow[]>();

  for (const row of progressRows) {
    if (!byUser.has(row.user_id)) byUser.set(row.user_id, []);
    byUser.get(row.user_id)!.push(row);
  }

  const extra: HabitCheckpointPlanItem[] = [];

  for (const userId of chatUserIds) {
    if (planned.has(userId)) continue;
    const rows = byUser.get(userId);
    if (!rows?.length) continue;

    const habits = collectUserJourneyHabits(rows);
    if (habits.length === 0) continue;

    const pendingTasks = collectPendingAcceptedTasks(rows);
    if (pendingTasks.length > 0) continue;

    const habitsDoneToday = mergeHabitsDoneTodayFromRows(rows);
    const slotHabits = filterHabitsForSlot(habits, slot, weekday);
    const due = slotHabits.filter((h) => !habitsDoneToday.has(h.id));
    if (due.length > 0) continue;

    const display = pickDisplayRow(rows);
    extra.push({
      userId,
      payload: {
        userId,
        slot,
        checkpointDate: dateKey,
        notifyMode: 'reinforce',
        reinforceKind: 'presence',
        habits: [],
        pendingTasks: [],
        completedTodayHabits: habits
          .filter((h) => habitsDoneToday.has(h.id))
          .map((h) => ({ id: h.id, title: h.title })),
        completedTodayTasks: collectCompletedAcceptedTasks(rows),
        stepTitle: display?.journey_steps?.title?.trim() ?? null,
        stationTitle: stationTitleFromJoin(display?.journey_steps?.journey_stations),
      },
    });
    planned.add(userId);
  }

  return extra.length > 0 ? [...plan, ...extra] : plan;
}

/** תכנון מלא כולל חיזוק נוכחות לפי צ'אט היום. */
export async function planHabitCheckpointTriggersWithChat(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  progressRows: ProgressRow[],
  slot: HabitCheckpointSlot,
  now: Date
): Promise<HabitCheckpointPlanItem[]> {
  const base = planHabitCheckpointTriggers(progressRows, slot, now);
  const chatIds = await fetchUserIdsWithChatToday(admin, now);
  return appendPresenceReinforceFromChat(base, progressRows, slot, now, chatIds);
}
