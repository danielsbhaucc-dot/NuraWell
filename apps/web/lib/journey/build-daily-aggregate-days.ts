/**
 * חישוב סטטוס יומי מצטבר לכל המשימות המקובלות — לשימוש ב-/progress (מעקב יומי).
 *
 * לכל יום:
 *   t = סך הסלוטים הצפויים מכל המשימות הפעילות באותו יום
 *   c = סך הביצועים שתועדו באותו יום
 *
 * כך "חלקי" מופיע כשהמשתמש ביצע חלק מהסלוטים (למשל 1 מתוך 3 ארוחות).
 */
import { parseJourneyTasksFull } from './journey-report-parse';
import { isTaskDueOnDate } from './build-task-history';
import {
  jerusalemDateKey,
  resolveTaskSchedule,
  slotsForSchedule,
} from './task-schedule';
import type { JourneyTask } from '../types/journey';

export type DailyAggregateDay = {
  d: string;
  /** ביצועים שתועדו */
  c: number;
  /** סלוטים צפויים (0 = יום לא פעיל — לא מציגים כפספוס) */
  t: number;
};

type StepShape = {
  id: string;
  tasks: unknown;
};

type ProgShape = {
  step_id: string;
  task_statuses?: Record<
    string,
    { status?: string; decided_at?: string | null }
  > | null;
};

export function buildDailyAggregateDays(
  steps: StepShape[],
  progressRows: ProgShape[],
  executionCountByDate: Map<string, number>,
  daysBack = 30,
  now: Date = new Date()
): DailyAggregateDay[] {
  const todayKey = jerusalemDateKey(now);
  const progByStep = new Map(progressRows.map((p) => [p.step_id, p]));

  /** רשימת משימות מקובלות עם metadata לחישוב */
  const acceptedTasks: Array<{
    task: JourneyTask;
    acceptedDateKey: string | null;
  }> = [];

  for (const step of steps) {
    const prog = progByStep.get(step.id);
    const ts = prog?.task_statuses ?? {};
    const tasks = parseJourneyTasksFull(step.tasks);
    for (const task of tasks) {
      const decision = ts[task.id];
      if (decision?.status !== 'accepted') continue;
      const accepted_at = decision.decided_at ?? null;
      acceptedTasks.push({
        task,
        acceptedDateKey: accepted_at ? jerusalemDateKey(new Date(accepted_at)) : null,
      });
    }
  }

  const out: DailyAggregateDay[] = [];
  for (let i = daysBack - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const dateKey = jerusalemDateKey(d);
    let expectedTotal = 0;
    for (const { task, acceptedDateKey } of acceptedTasks) {
      if (!isTaskDueOnDate(task, dateKey, acceptedDateKey)) continue;
      const { schedule, times_per_day } = resolveTaskSchedule(task);
      expectedTotal += slotsForSchedule(schedule, times_per_day).length;
    }
    const c = executionCountByDate.get(dateKey) ?? 0;
    out.push({ d: dateKey, c, t: expectedTotal });
  }

  /** אם אין משימות מקובלות — נשמור t=1 לתאימות (התנהגות ישנה) */
  if (acceptedTasks.length === 0) {
    return out.map((day) => ({ ...day, t: 1 }));
  }

  return out;
}
