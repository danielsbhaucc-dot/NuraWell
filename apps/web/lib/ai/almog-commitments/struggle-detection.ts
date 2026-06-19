/**
 * זיהוי קושי / חוסר עדכון / ביצוע חלקי במשימות מהשיעור.
 * מקור: journey_progress + journey_task_executions (SSOT).
 */

import type { JourneyTask } from '../../types/journey';
import {
  jerusalemDateKey,
  jerusalemWeekday,
  resolveTaskSchedule,
  slotsForSchedule,
  type UserMealProfile,
} from '../../journey/task-schedule';
import { parseJourneyTasksFull } from '../../journey/journey-report-parse';
import { parseTaskLevelMeta } from '../../journey/task-level-meta';
import type { ProgressRow } from '../../workflows/habit-checkpoint-batch';

export type StruggleKind =
  | 'no_update_today'
  | 'partial_today'
  | 'partial_pattern'
  | 'inactive_days'
  | 'explicit_hard';

export type StruggleSeverity = 'inquiry' | 'plan';

export type StruggleSignal = {
  kind: StruggleKind;
  severity: StruggleSeverity;
  userId: string;
  stepId: string;
  taskId: string;
  taskTitle: string;
  task: JourneyTask;
  expectedToday: number;
  reportedToday: number;
  pendingSlotLabels: string[];
  daysSinceLastExecution: number;
};

type ExecutionRow = {
  task_id: string;
  date_key: string;
  slot: string;
  outcome?: string | null;
};

type TaskStatusEntry = { status?: unknown; execution_done?: unknown; last_feedback?: unknown };

function asStatusMap(raw: unknown): Record<string, TaskStatusEntry> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as Record<string, TaskStatusEntry>;
}

function isSuccessOutcome(outcome: string | null | undefined): boolean {
  return !outcome || outcome === 'completed';
}

function countExpectedToday(task: JourneyTask, weekday: number, mealProfile?: UserMealProfile | null): number {
  const resolved = resolveTaskSchedule(task, mealProfile ?? null);
  if (resolved.schedule === 'one_time') return 1;
  if (resolved.schedule === 'weekly') {
    return resolved.weekly_day === weekday ? 1 : 0;
  }
  return slotsForSchedule(resolved.schedule, resolved.times_per_day).length;
}

function countReportedToday(
  taskId: string,
  executions: ExecutionRow[],
  todayKey: string
): number {
  const doneSlots = new Set(
    executions
      .filter(
        (e) =>
          e.task_id === taskId &&
          e.date_key === todayKey &&
          isSuccessOutcome(e.outcome ?? null)
      )
      .map((e) => e.slot)
  );
  return doneSlots.size;
}

function daysSinceLastExecution(taskId: string, executions: ExecutionRow[], todayKey: string): number {
  const keys = executions
    .filter((e) => e.task_id === taskId && isSuccessOutcome(e.outcome ?? null))
    .map((e) => e.date_key)
    .sort()
    .reverse();
  if (!keys.length) return 99;
  const last = keys[0]!;
  if (last === todayKey) return 0;
  const [y, m, d] = todayKey.split('-').map(Number);
  const [ly, lm, ld] = last.split('-').map(Number);
  const todayUtc = Date.UTC(y, m - 1, d);
  const lastUtc = Date.UTC(ly, lm - 1, ld);
  return Math.max(1, Math.round((todayUtc - lastUtc) / 86_400_000));
}

function underDeliveryDays(
  taskId: string,
  task: JourneyTask,
  executions: ExecutionRow[],
  todayKey: string,
  weekday: number,
  mealProfile: UserMealProfile | null | undefined,
  lookback = 3
): number {
  let count = 0;
  const [y, m, d] = todayKey.split('-').map(Number);
  for (let i = 1; i <= lookback; i++) {
    const dt = new Date(Date.UTC(y, m - 1, d - i));
    const key = jerusalemDateKey(dt);
    const wd = jerusalemWeekday(dt);
    const expected = countExpectedToday(task, wd, mealProfile);
    if (expected <= 0) continue;
    const reported = countReportedToday(taskId, executions, key);
    if (reported > 0 && reported < expected) count += 1;
  }
  return count;
}

export function detectJourneyStruggles(params: {
  userId: string;
  progressRows: ProgressRow[];
  executions: ExecutionRow[];
  now?: Date;
  mealProfile?: UserMealProfile | null;
  /** משימות שכבר בתוכנית recovery פעילה — לא לפתוח שוב */
  activeRecoveryTaskIds?: ReadonlySet<string>;
}): StruggleSignal[] {
  const now = params.now ?? new Date();
  const todayKey = jerusalemDateKey(now);
  const weekday = jerusalemWeekday(now);
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Jerusalem',
      hour: 'numeric',
      hour12: false,
    }).format(now)
  );
  const recovery = params.activeRecoveryTaskIds ?? new Set<string>();
  const out: StruggleSignal[] = [];
  const seen = new Set<string>();

  for (const row of params.progressRows) {
    if (!row.journey_steps) continue;
    const stepId = row.step_id;
    if (!stepId) continue;
    const tasks = parseJourneyTasksFull(row.journey_steps.tasks);
    const statuses = asStatusMap(row.task_statuses);

    for (const task of tasks) {
      if (seen.has(task.id)) continue;
      const st = statuses[task.id];
      if (!st || st.status !== 'accepted') continue;
      if (st.execution_done === true) continue;
      if (recovery.has(task.id)) continue;

      const expected = countExpectedToday(task, weekday, params.mealProfile);
      if (expected <= 0) continue;

      const reported = countReportedToday(task.id, params.executions, todayKey);
      const inactive = daysSinceLastExecution(task.id, params.executions, todayKey);
      const patternDays = underDeliveryDays(
        task.id,
        task,
        params.executions,
        todayKey,
        weekday,
        params.mealProfile
      );

      const pendingCount = Math.max(0, expected - reported);
      const pendingSlotLabels =
        pendingCount > 0 ? Array.from({ length: pendingCount }, (_, i) => `סלוט ${i + 1}`) : [];

      const taskMeta = parseTaskLevelMeta(row.task_level_meta, task.id);
      const lastFeedback = taskMeta?.last_feedback;

      if (lastFeedback === 'too_hard') {
        seen.add(task.id);
        out.push({
          kind: 'explicit_hard',
          severity: 'plan',
          userId: params.userId,
          stepId,
          taskId: task.id,
          taskTitle: task.title,
          task,
          expectedToday: expected,
          reportedToday: reported,
          pendingSlotLabels,
          daysSinceLastExecution: inactive,
        });
        continue;
      }

      if (reported > 0 && reported < expected) {
        seen.add(task.id);
        out.push({
          kind: 'partial_today',
          severity: patternDays >= 1 ? 'plan' : 'inquiry',
          userId: params.userId,
          stepId,
          taskId: task.id,
          taskTitle: task.title,
          task,
          expectedToday: expected,
          reportedToday: reported,
          pendingSlotLabels,
          daysSinceLastExecution: inactive,
        });
        continue;
      }

      if (patternDays >= 2) {
        seen.add(task.id);
        out.push({
          kind: 'partial_pattern',
          severity: 'plan',
          userId: params.userId,
          stepId,
          taskId: task.id,
          taskTitle: task.title,
          task,
          expectedToday: expected,
          reportedToday: reported,
          pendingSlotLabels,
          daysSinceLastExecution: inactive,
        });
        continue;
      }

      if (reported === 0 && hour >= 12) {
        seen.add(task.id);
        out.push({
          kind: inactive >= 3 ? 'inactive_days' : 'no_update_today',
          severity: inactive >= 3 ? 'plan' : 'inquiry',
          userId: params.userId,
          stepId,
          taskId: task.id,
          taskTitle: task.title,
          task,
          expectedToday: expected,
          reportedToday: 0,
          pendingSlotLabels,
          daysSinceLastExecution: inactive,
        });
      }
    }
  }

  return out;
}

const KIND_LABEL: Record<StruggleKind, string> = {
  no_update_today: 'לא עדכן היום',
  partial_today: 'ביצוע חלקי היום',
  partial_pattern: 'דפוס ביצוע חלקי',
  inactive_days: 'ימים ללא עדכון',
  explicit_hard: 'דיווח קשה',
};

/** בלוק קומפקטי לצ'אט — מצב קושי נוכחי (לא חוסר תגובה) */
export function formatStruggleSignalsForChat(signals: StruggleSignal[]): string | null {
  if (!signals.length) return null;
  const lines = signals.slice(0, 3).map((s) => {
    const partial =
      s.expectedToday > 1
        ? ` (${s.reportedToday}/${s.expectedToday} היום)`
        : '';
    return `- ${KIND_LABEL[s.kind]}: "${s.taskTitle}"${partial}`;
  });
  return (
    `[קושי במשימות מהשיעור]\n${lines.join('\n')}\n` +
    `התייחס בעדינות. אם המשתמש לא ביקש עזרה — שאל שאלה אחת קצרה לפני הצעת צעד חדש.`
  );
}
