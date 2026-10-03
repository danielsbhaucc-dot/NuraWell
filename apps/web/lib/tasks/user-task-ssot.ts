/**
 * מקור אמת אחד (SSOT) לסטטוסי משימה בממשק.
 *
 * יש שני מאגרים פיזיים:
 *  - מסע: journey_progress.task_statuses + journey_task_executions
 *  - אלמוג: almog_assignments.status
 *
 * מיפוי אחיד לכל המסכים (בית, רשימת היום, תוכנית, מסע, היסטוריה, התקדמות):
 *  - active    ← מסע accepted שעדיין רלוונטי להיום | אלמוג active|frozen
 *  - completed ← מסע שבוצע (היום / one_time) | אלמוג completed
 *  - rejected  ← מסע rejected | אלמוג dropped
 */

import {
  countAcceptedTaskExecutionToday,
  countTaskStatusesByReport,
  listPendingTasksToday,
  type JourneyReportStepShape,
  type PendingTaskTodayRow,
  type TodayExecutionRow,
} from '../journey/journey-report-parse';
import { groupSimilarByTitle } from '../ai/almog-commitments/title-similarity';

export type UnifiedTaskLifecycle = 'active' | 'completed' | 'rejected';

export type AlmogAssignmentStatus = 'active' | 'frozen' | 'completed' | 'dropped';

export type AlmogAssignmentLike = {
  id: string;
  title: string;
  status: AlmogAssignmentStatus | string;
  schedule?: 'one_time' | 'daily' | 'weekly' | string | null;
};

/** מחליט סטטוס מאוחד ממשימת מסע. */
export function mapJourneyDecisionToUnified(
  status: string | undefined,
  opts?: { doneForToday?: boolean }
): UnifiedTaskLifecycle | 'pending' | null {
  if (status === 'rejected') return 'rejected';
  if (status === 'accepted') {
    return opts?.doneForToday ? 'completed' : 'active';
  }
  if (status === 'pending') return 'pending';
  return null;
}

/** מחליט סטטוס מאוחד ממשימת אלמוג. */
export function mapAlmogStatusToUnified(
  status: string | undefined
): UnifiedTaskLifecycle | null {
  if (status === 'active' || status === 'frozen') return 'active';
  if (status === 'completed') return 'completed';
  if (status === 'dropped') return 'rejected';
  return null;
}

export function isAlmogOpenStatus(status: string | undefined): boolean {
  return status === 'active' || status === 'frozen';
}

export type UnifiedTaskCounts = {
  /** כמה משימות פתוחות עכשיו (מסע להיום + אלמוג פתוחות). */
  active: number;
  /** כמה הושלמו (בוצע היום במסע + אלמוג completed). */
  completed: number;
  /** כמה נדחו (מסע rejected + אלמוג dropped). */
  rejected: number;
  /** כמה מצופות היום (מקור למונה בבית / רשימת היום). */
  dueToday: number;
  /** כמה בוצעו היום מתוך dueToday. */
  doneToday: number;
  /** כמה נשארו להיום. */
  pendingToday: number;
};

export type UserTaskSnapshotCounts = {
  journey: {
    accepted: number;
    rejected: number;
    dueToday: number;
    doneToday: number;
    pendingToday: number;
  };
  almog: {
    active: number;
    completed: number;
    dropped: number;
  };
  /** מונים מאוחדים — חובה לכל מסך שמדבר על "משימה פעילה/הושלם/נדחה". */
  unified: UnifiedTaskCounts;
};

export type AlmogTodayRow = {
  id: string;
  title: string;
  source: 'almog';
  status: UnifiedTaskLifecycle;
  schedule: string | null;
  done: boolean;
  /** מזהים של וריאציות כמעט-זהות שאוחדו לתצוגה (כולל id). */
  groupedIds?: string[];
  /** כמה וריאציות דומות אוחדו — >1 כשיש כפילויות. */
  similarCount?: number;
};

export type BuildUserTaskSnapshotInput = {
  steps: JourneyReportStepShape[];
  todayExecutions?: ReadonlyArray<TodayExecutionRow>;
  todayDateKey?: string;
  almogAssignments?: ReadonlyArray<AlmogAssignmentLike>;
  /** משימות אלמוג בסטטוס completed (מה-API limit). */
  almogCompleted?: ReadonlyArray<AlmogAssignmentLike>;
  /** משימות שנדחו/dropped אם ידועות בנפרד. */
  almogDroppedCount?: number;
};

export type UserTaskSnapshot = {
  counts: UserTaskSnapshotCounts;
  /** משימות מסע להיום (accepted בלבד). */
  journeyToday: PendingTaskTodayRow[];
  /** משימות אלמוג פתוחות — לתצוגה בבית / רשימת היום. */
  almogOpen: AlmogTodayRow[];
};

/**
 * בונה צילום מצב מאוחד ממקורות המסע + אלמוג.
 * כל מסך UI שמציג מוני משימות חייב להסתמך על `counts.unified` מכאן.
 */
export function buildUserTaskSnapshot(input: BuildUserTaskSnapshotInput): UserTaskSnapshot {
  const todayExecutions = input.todayExecutions ?? [];
  const journeyToday = listPendingTasksToday(
    input.steps,
    todayExecutions,
    input.todayDateKey
  );
  const journeyTodayCounts = countAcceptedTaskExecutionToday(
    input.steps,
    todayExecutions,
    input.todayDateKey
  );
  const journeyStatuses = countTaskStatusesByReport(input.steps);

  const almogOpenRaw = (input.almogAssignments ?? []).filter((a) =>
    isAlmogOpenStatus(a.status)
  );
  const almogCompletedList = input.almogCompleted ?? [];
  const almogCompleted =
    almogCompletedList.length > 0
      ? almogCompletedList.length
      : (input.almogAssignments ?? []).filter((a) => a.status === 'completed').length;
  const almogDropped =
    typeof input.almogDroppedCount === 'number'
      ? input.almogDroppedCount
      : (input.almogAssignments ?? []).filter((a) => a.status === 'dropped').length;

  // קיבוץ כותרות כמעט-זהות — מונע "16 שיבוטים" ברשימת היום / מונים.
  const almogOpen: AlmogTodayRow[] = groupSimilarByTitle(
    almogOpenRaw.map((a) => ({
      id: a.id,
      title: a.title,
      source: 'almog' as const,
      status: 'active' as const,
      schedule: typeof a.schedule === 'string' ? a.schedule : null,
      done: false,
    })),
    0.55
  ).map((g) => ({
    id: g.id,
    title: g.title,
    source: 'almog' as const,
    status: 'active' as const,
    schedule: g.schedule,
    done: false,
    groupedIds: g.groupedIds,
    similarCount: g.similarCount,
  }));

  const almogActiveGrouped = almogOpen.length;
  const dueToday = journeyTodayCounts.dueToday + almogActiveGrouped;
  const doneToday = journeyTodayCounts.done;
  const pendingToday = Math.max(0, dueToday - doneToday);

  const unified: UnifiedTaskCounts = {
    active: journeyTodayCounts.pending + almogActiveGrouped,
    completed: doneToday + almogCompleted,
    rejected: journeyStatuses.rejected + almogDropped,
    dueToday,
    doneToday,
    pendingToday,
  };

  return {
    counts: {
      journey: {
        accepted: journeyTodayCounts.accepted,
        rejected: journeyStatuses.rejected,
        dueToday: journeyTodayCounts.dueToday,
        doneToday: journeyTodayCounts.done,
        pendingToday: journeyTodayCounts.pending,
      },
      almog: {
        active: almogActiveGrouped,
        completed: almogCompleted,
        dropped: almogDropped,
      },
      unified,
    },
    journeyToday,
    almogOpen,
  };
}

/** האם למשתמש יש בכלל משימות שנלקחו (מסע או אלמוג). */
export function hasAnyTakenTasks(counts: UserTaskSnapshotCounts): boolean {
  return counts.journey.accepted > 0 || counts.almog.active > 0 || counts.almog.completed > 0;
}
