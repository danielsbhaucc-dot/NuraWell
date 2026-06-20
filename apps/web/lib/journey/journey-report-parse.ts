import {
  isTaskActiveToday,
  resolveTaskSchedule,
  slotLabel,
  slotsForSchedule,
} from './task-schedule';
import type { JourneyTask, JourneyTaskSlot } from '../types/journey';

/** פריטי משימה/הרגל מתוך שדה JSON ב-journey_steps — שימוש חוזר בדיווח ובתפריט פעולות */

export function parseJourneyReportItems(raw: unknown): { id: string; title: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const id = typeof row.id === 'string' ? row.id : '';
      const title = typeof row.title === 'string' ? row.title : '';
      if (!id || !title) return null;
      return { id, title };
    })
    .filter((x): x is { id: string; title: string } => Boolean(x));
}

/** פרסור מלא של משימות מ-JSON — כולל schedule לחישוב יומי. */
export function parseJourneyTasksFull(raw: unknown): JourneyTask[] {
  if (!Array.isArray(raw)) return [];
  const out: JourneyTask[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const id = typeof row.id === 'string' ? row.id : '';
    const title = typeof row.title === 'string' ? row.title : '';
    if (!id || !title) continue;
    out.push({
      id,
      title,
      description: typeof row.description === 'string' ? row.description : null,
      emoji: typeof row.emoji === 'string' ? row.emoji : '✅',
      schedule: row.schedule as JourneyTask['schedule'],
      times_per_day: typeof row.times_per_day === 'number' ? row.times_per_day : null,
      weekly_day: typeof row.weekly_day === 'number' ? row.weekly_day : null,
      meal_timing: row.meal_timing as JourneyTask['meal_timing'],
      meal_target: row.meal_target as JourneyTask['meal_target'],
      leveling:
        row.leveling && typeof row.leveling === 'object' && !Array.isArray(row.leveling)
          ? (row.leveling as JourneyTask['leveling'])
          : null,
    });
  }
  return out;
}

export type TodayExecutionRow = {
  task_id: string;
  slot: string;
  date_key: string;
};

export type JourneyReportStepShape = {
  id: string;
  title: string;
  step_number: number;
  tasks: unknown;
  progress: {
    task_statuses?: Record<string, { status?: string }>;
  } | null;
};

export function countTaskStatusesByReport(steps: JourneyReportStepShape[]) {
  let accepted = 0;
  let rejected = 0;
  for (const step of steps) {
    const tasks = parseJourneyReportItems(step.tasks);
    const ts = step.progress?.task_statuses ?? {};
    for (const t of tasks) {
      const st = ts[t.id]?.status;
      if (st === 'accepted') accepted++;
      else if (st === 'rejected') rejected++;
    }
  }
  return { accepted, rejected };
}

type TaskStatusEntry = { status?: string; execution_done?: boolean };

/** משימות שהמשתמש לקח על עצמו (accepted) — כמה בוצעו וכמה ממתינות (legacy: one_time בלבד) */
export function countAcceptedTaskExecution(steps: JourneyReportStepShape[]) {
  let accepted = 0;
  let done = 0;
  for (const step of steps) {
    const tasks = parseJourneyReportItems(step.tasks);
    const ts = (step.progress?.task_statuses ?? {}) as Record<string, TaskStatusEntry>;
    for (const t of tasks) {
      const entry = ts[t.id];
      if (entry?.status === 'accepted') {
        accepted++;
        if (entry.execution_done) done++;
      }
    }
  }
  return { accepted, done, pending: Math.max(0, accepted - done) };
}

/**
 * ספירת משימות לפי ביצוע **היום** — מקור אמת: journey_task_executions.
 *
 *  - one_time: execution_done (כמו קודם).
 *  - recurring פעיל היום: "בוצע" רק כשכל הסלוטים של היום סומנו.
 *  - recurring לא פעיל היום (למשל שבועי ביום אחר): לא נספר ב-pending של היום.
 */
export function countAcceptedTaskExecutionToday(
  steps: JourneyReportStepShape[],
  todayExecutions: ReadonlyArray<TodayExecutionRow> = [],
  todayDateKey?: string
): { accepted: number; done: number; pending: number; dueToday: number } {
  const doneSlotsByTask = new Map<string, Set<string>>();
  for (const e of todayExecutions) {
    if (todayDateKey && e.date_key !== todayDateKey) continue;
    if (!doneSlotsByTask.has(e.task_id)) doneSlotsByTask.set(e.task_id, new Set());
    doneSlotsByTask.get(e.task_id)!.add(e.slot);
  }

  let accepted = 0;
  let done = 0;
  let dueToday = 0;

  for (const step of steps) {
    const tasks = parseJourneyTasksFull(step.tasks);
    const ts = (step.progress?.task_statuses ?? {}) as Record<string, TaskStatusEntry>;
    for (const t of tasks) {
      const entry = ts[t.id];
      if (entry?.status !== 'accepted') continue;
      accepted++;

      const { schedule, times_per_day } = resolveTaskSchedule(t);
      if (schedule === 'one_time') {
        dueToday++;
        if (entry.execution_done === true) done++;
        continue;
      }

      if (!isTaskActiveToday(t)) continue;
      dueToday++;

      const expected = slotsForSchedule(schedule, times_per_day);
      const doneSlots = doneSlotsByTask.get(t.id) ?? new Set<string>();
      const allDone = expected.every((sl) => doneSlots.has(sl));
      if (allDone) done++;
    }
  }

  const pending = Math.max(0, dueToday - done);
  return { accepted, done, pending, dueToday };
}

export type PendingTaskTodayRow = {
  id: string;
  title: string;
  emoji: string;
  stepTitle: string;
  stepNumber: number;
  /** סלוטים שעדיין לא סומנו היום (למשימות חוזרות). */
  pendingSlots: string[];
  done: boolean;
};

/** רשימת משימות פתוחות/סגורות להיום — לתצוגה בבית ובפופאפ. */
export function listPendingTasksToday(
  steps: JourneyReportStepShape[],
  todayExecutions: ReadonlyArray<TodayExecutionRow> = [],
  todayDateKey?: string
): PendingTaskTodayRow[] {
  const doneSlotsByTask = new Map<string, Set<string>>();
  for (const e of todayExecutions) {
    if (todayDateKey && e.date_key !== todayDateKey) continue;
    if (!doneSlotsByTask.has(e.task_id)) doneSlotsByTask.set(e.task_id, new Set());
    doneSlotsByTask.get(e.task_id)!.add(e.slot);
  }

  const out: PendingTaskTodayRow[] = [];

  for (const step of steps) {
    const tasks = parseJourneyTasksFull(step.tasks);
    const ts = (step.progress?.task_statuses ?? {}) as Record<string, TaskStatusEntry>;
    for (const t of tasks) {
      const entry = ts[t.id];
      if (entry?.status !== 'accepted') continue;

      const { schedule, times_per_day } = resolveTaskSchedule(t);
      if (schedule === 'one_time') {
        const done = entry.execution_done === true;
        out.push({
          id: t.id,
          title: t.title,
          emoji: t.emoji ?? '✅',
          stepTitle: step.title,
          stepNumber: step.step_number,
          pendingSlots: done ? [] : ['once'],
          done,
        });
        continue;
      }

      if (!isTaskActiveToday(t)) continue;

      const expected = slotsForSchedule(schedule, times_per_day);
      const doneSlots = doneSlotsByTask.get(t.id) ?? new Set<string>();
      const pendingSlots = expected
        .filter((sl) => !doneSlots.has(sl))
        .map((sl) => slotLabel(sl, t.meal_timing ?? undefined));
      const done = pendingSlots.length === 0;

      out.push({
        id: t.id,
        title: t.title,
        emoji: t.emoji ?? '✅',
        stepTitle: step.title,
        stepNumber: step.step_number,
        pendingSlots,
        done,
      });
    }
  }

  return out.sort(
    (a, b) =>
      Number(a.done) - Number(b.done) ||
      a.stepNumber - b.stepNumber ||
      a.title.localeCompare(b.title, 'he')
  );
}

export type DeclinedTaskRow = {
  stepId: string;
  stepNumber: number;
  stepTitle: string;
  taskId: string;
  taskTitle: string;
};

export function listDeclinedTasksFromReport(steps: JourneyReportStepShape[]): DeclinedTaskRow[] {
  const out: DeclinedTaskRow[] = [];
  for (const step of steps) {
    const tasks = parseJourneyReportItems(step.tasks);
    const ts = step.progress?.task_statuses ?? {};
    for (const t of tasks) {
      if (ts[t.id]?.status === 'rejected') {
        out.push({
          stepId: step.id,
          stepNumber: step.step_number,
          stepTitle: step.title,
          taskId: t.id,
          taskTitle: t.title,
        });
      }
    }
  }
  return out.sort((a, b) => a.stepNumber - b.stepNumber || a.taskTitle.localeCompare(b.taskTitle, 'he'));
}
