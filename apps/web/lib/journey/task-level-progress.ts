/**
 * task-level-progress.ts
 * ----------------------
 * חישוב התקדמות ברמות קושי של משימות + המלצות העלאה/הורדת רמה.
 */

import type {
  JourneyTask,
  JourneyTaskLevelMeta,
  JourneyTaskLevelingConfig,
  TaskDifficultyFeedback,
} from '../types/journey';
import {
  jerusalemDateKey,
  resolveTaskSchedule,
  slotsForSchedule,
  type TaskExecutionLike,
} from './task-schedule';
import {
  getLevelOrder,
  getNextLevelId,
  getPreviousLevelId,
  initTaskLevelMeta,
  parseTaskLevelMeta,
} from './task-level-meta';

export type TaskLevelDayStatus = 'success' | 'failed' | 'pending' | 'inactive';

export type TaskLevelProgressSnapshot = {
  taskId: string;
  hasLeveling: boolean;
  currentLevelId: string | null;
  currentLevelLabel: string | null;
  recommendedLevelId: string | null;
  recommendedLevelLabel: string | null;
  startLevelId: string | null;
  successStreakCurrentLevel: number;
  successDaysCurrentLevel: number;
  habitStreakAnyLevel: number;
  habitStreakRecommendedLevel: number;
  levelUpAfterSuccessDays: number;
  daysUntilLevelUpSuggestion: number;
  shouldSuggestLevelUp: boolean;
  shouldSuggestDowngrade: boolean;
  nextLevelId: string | null;
  nextLevelLabel: string | null;
  previousLevelId: string | null;
  atOrAboveRecommended: boolean;
  recentDays: Array<{ dateKey: string; status: TaskLevelDayStatus }>;
  meta: JourneyTaskLevelMeta | null;
};

export type TaskLevelAdjustment = {
  kind: 'level_up' | 'downgrade' | 'none';
  nextLevelId: string | null;
  reason: string;
  metaPatch: Partial<JourneyTaskLevelMeta>;
};

type ExecutionWithOutcome = TaskExecutionLike & { outcome?: string | null };

/** שורות ביצוע כפי שחוזרות מ-API — slot כ-string לפני המרה ל-JourneyTaskSlot */
export type ApiTaskExecutionRow = {
  task_id: string;
  date_key: string;
  slot: string;
  outcome?: string | null;
};

export function coerceTaskExecutionsFromApi(
  executions: ReadonlyArray<ApiTaskExecutionRow>
): ReadonlyArray<ExecutionWithOutcome> {
  return executions as ReadonlyArray<ExecutionWithOutcome>;
}

const LEVEL_UP_DECLINE_COOLDOWN_DAYS = 3;
const DOWNGRADE_FAILURE_DAYS = 3;

function addDaysToDateKey(dateKey: string, delta: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return jerusalemDateKey(dt);
}

function buildRecentDateKeys(todayKey: string, count: number): string[] {
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    out.push(addDaysToDateKey(todayKey, -i));
  }
  return out;
}

function isDaySuccess(
  task: JourneyTask,
  executions: ReadonlyArray<ExecutionWithOutcome>,
  taskId: string,
  dateKey: string
): boolean {
  const { schedule, times_per_day } = resolveTaskSchedule(task);
  if (schedule === 'one_time') {
    return executions.some(
      (e) =>
        e.task_id === taskId &&
        e.date_key === dateKey &&
        (!e.outcome || e.outcome === 'completed')
    );
  }
  const expected = slotsForSchedule(schedule, times_per_day);
  const doneSlots = new Set(
    executions
      .filter(
        (e) =>
          e.task_id === taskId &&
          e.date_key === dateKey &&
          (!e.outcome || e.outcome === 'completed')
      )
      .map((e) => e.slot)
  );
  return expected.every((sl) => doneSlots.has(sl));
}

function isDayFailed(
  task: JourneyTask,
  executions: ReadonlyArray<ExecutionWithOutcome>,
  taskId: string,
  dateKey: string,
  todayKey: string
): boolean {
  if (dateKey === todayKey) return false;
  const { schedule } = resolveTaskSchedule(task);
  if (schedule === 'one_time') return false;
  return !isDaySuccess(task, executions, taskId, dateKey);
}

function countStreakFromRecent(
  recentDays: Array<{ dateKey: string; status: TaskLevelDayStatus }>,
  todayKey: string,
  match: (status: TaskLevelDayStatus) => boolean
): number {
  let streak = 0;
  for (let i = recentDays.length - 1; i >= 0; i--) {
    const day = recentDays[i]!;
    if (match(day.status)) {
      streak++;
    } else if (day.dateKey === todayKey && day.status === 'pending') {
      continue;
    } else {
      break;
    }
  }
  return streak;
}

function daysSinceIso(iso: string | null | undefined): number {
  if (!iso) return 999;
  const then = new Date(iso).getTime();
  const now = Date.now();
  return Math.floor((now - then) / (24 * 60 * 60 * 1000));
}

export function isTaskLevelAtOrAboveRecommended(
  leveling: JourneyTaskLevelingConfig,
  currentLevelId: string
): boolean {
  const rec = leveling.recommended_level_id;
  if (!rec) return false;
  const curOrder = getLevelOrder(leveling.levels, currentLevelId);
  const recOrder = getLevelOrder(leveling.levels, rec);
  return curOrder >= 0 && recOrder >= 0 && curOrder >= recOrder;
}

export function ensureTaskLevelMeta(
  task: JourneyTask,
  existingMeta: unknown
): JourneyTaskLevelMeta | null {
  if (!task.leveling?.levels?.length) return null;
  const parsed = parseTaskLevelMeta(existingMeta, task.id);
  if (parsed) return parsed;

  const startId =
    task.leveling.start_level_id ??
    task.leveling.levels.find((l) => !l.is_recommended)?.id ??
    task.leveling.levels[0]!.id;
  return initTaskLevelMeta(startId, task.leveling.recommended_level_id);
}

export function computeTaskLevelProgressSnapshot(options: {
  task: JourneyTask;
  executions: ReadonlyArray<ExecutionWithOutcome>;
  taskLevelMeta?: unknown;
  todayKey?: string;
  historyDays?: number;
}): TaskLevelProgressSnapshot {
  const task = options.task;
  const taskId = task.id;
  const todayKey = options.todayKey ?? jerusalemDateKey();
  const historyDays = options.historyDays ?? 21;
  const leveling = task.leveling;

  if (!leveling?.levels?.length) {
    return {
      taskId,
      hasLeveling: false,
      currentLevelId: null,
      currentLevelLabel: null,
      recommendedLevelId: null,
      recommendedLevelLabel: null,
      startLevelId: null,
      successStreakCurrentLevel: 0,
      successDaysCurrentLevel: 0,
      habitStreakAnyLevel: 0,
      habitStreakRecommendedLevel: 0,
      levelUpAfterSuccessDays: 7,
      daysUntilLevelUpSuggestion: 7,
      shouldSuggestLevelUp: false,
      shouldSuggestDowngrade: false,
      nextLevelId: null,
      nextLevelLabel: null,
      previousLevelId: null,
      atOrAboveRecommended: false,
      recentDays: [],
      meta: null,
    };
  }

  const meta = ensureTaskLevelMeta(task, options.taskLevelMeta);
  const currentLevelId = meta?.current_level_id ?? leveling.start_level_id ?? leveling.levels[0]!.id;
  const currentLevel = leveling.levels.find((l) => l.id === currentLevelId) ?? null;
  const recommendedLevel = leveling.levels.find((l) => l.id === leveling.recommended_level_id) ?? null;
  const atOrAboveRecommended = isTaskLevelAtOrAboveRecommended(leveling, currentLevelId);

  const dateKeys = buildRecentDateKeys(todayKey, historyDays);
  const recentDays: Array<{ dateKey: string; status: TaskLevelDayStatus }> = [];

  for (const dk of dateKeys) {
    if (dk === todayKey) {
      recentDays.push({
        dateKey: dk,
        status: isDaySuccess(task, options.executions, taskId, dk) ? 'success' : 'pending',
      });
      continue;
    }
    if (isDaySuccess(task, options.executions, taskId, dk)) {
      recentDays.push({ dateKey: dk, status: 'success' });
    } else if (isDayFailed(task, options.executions, taskId, dk, todayKey)) {
      recentDays.push({ dateKey: dk, status: 'failed' });
    } else {
      recentDays.push({ dateKey: dk, status: 'inactive' });
    }
  }

  const successStreakCurrentLevel = countStreakFromRecent(
    recentDays,
    todayKey,
    (s) => s === 'success'
  );

  const successDaysCurrentLevel = recentDays.filter((d) => d.status === 'success').length;
  const habitStreakAnyLevel = successStreakCurrentLevel;

  let habitStreakRecommendedLevel = 0;
  if (atOrAboveRecommended) {
    habitStreakRecommendedLevel = successStreakCurrentLevel;
  }

  const levelUpAfter = leveling.level_up_after_success_days ?? 7;
  const daysUntilLevelUpSuggestion = Math.max(0, levelUpAfter - successStreakCurrentLevel);

  const nextLevelId = getNextLevelId(leveling.levels, currentLevelId);
  const previousLevelId = getPreviousLevelId(leveling.levels, currentLevelId);
  const nextLevel = nextLevelId ? leveling.levels.find((l) => l.id === nextLevelId) : null;

  const declinedRecently =
    daysSinceIso(meta?.level_up_declined_at) < LEVEL_UP_DECLINE_COOLDOWN_DAYS;
  const lastFeedback = meta?.last_feedback;

  let shouldSuggestLevelUp = false;
  if (
    nextLevelId &&
    leveling.allow_user_upgrade !== false &&
    !declinedRecently &&
    lastFeedback !== 'too_hard'
  ) {
    if (successStreakCurrentLevel >= levelUpAfter) shouldSuggestLevelUp = true;
    if (lastFeedback === 'too_easy') shouldSuggestLevelUp = true;
  }

  let shouldSuggestDowngrade = false;
  if (previousLevelId && leveling.allow_user_downgrade !== false) {
    if (lastFeedback === 'too_hard') shouldSuggestDowngrade = true;
    const last3 = recentDays.slice(-4, -1);
    const failures = last3.filter((d) => d.status === 'failed').length;
    if (failures >= DOWNGRADE_FAILURE_DAYS) shouldSuggestDowngrade = true;
  }

  return {
    taskId,
    hasLeveling: true,
    currentLevelId,
    currentLevelLabel: currentLevel?.label ?? null,
    recommendedLevelId: leveling.recommended_level_id,
    recommendedLevelLabel: recommendedLevel?.label ?? null,
    startLevelId: leveling.start_level_id,
    successStreakCurrentLevel,
    successDaysCurrentLevel,
    habitStreakAnyLevel,
    habitStreakRecommendedLevel,
    levelUpAfterSuccessDays: levelUpAfter,
    daysUntilLevelUpSuggestion,
    shouldSuggestLevelUp,
    shouldSuggestDowngrade,
    nextLevelId,
    nextLevelLabel: nextLevel?.label ?? null,
    previousLevelId,
    atOrAboveRecommended,
    recentDays,
    meta,
  };
}

export function recommendTaskLevelAdjustment(
  snapshot: TaskLevelProgressSnapshot,
  task: JourneyTask,
  feedback?: TaskDifficultyFeedback | 'accept_level_up' | 'decline_level_up' | 'downgrade'
): TaskLevelAdjustment {
  const leveling = task.leveling;
  if (!leveling || !snapshot.meta) {
    return { kind: 'none', nextLevelId: null, reason: 'no_leveling', metaPatch: {} };
  }

  const now = new Date().toISOString();
  const meta = snapshot.meta;

  if (feedback === 'accept_level_up' && snapshot.nextLevelId) {
    return {
      kind: 'level_up',
      nextLevelId: snapshot.nextLevelId,
      reason: 'המשתמש אישר העלאת רמה',
      metaPatch: {
        current_level_id: snapshot.nextLevelId,
        current_level_started_at: now,
        success_streak_current_level: 0,
        success_days_current_level: 0,
        last_feedback: 'ok',
        last_feedback_at: now,
        level_up_suggested_at: null,
        best_level_id: snapshot.nextLevelId,
        reached_recommended_at: isTaskLevelAtOrAboveRecommended(leveling, snapshot.nextLevelId)
          ? meta.reached_recommended_at ?? now
          : meta.reached_recommended_at,
        recommended_streak_current: isTaskLevelAtOrAboveRecommended(leveling, snapshot.nextLevelId)
          ? 0
          : meta.recommended_streak_current,
      },
    };
  }

  if (feedback === 'decline_level_up') {
    return {
      kind: 'none',
      nextLevelId: null,
      reason: 'declined',
      metaPatch: { level_up_declined_at: now },
    };
  }

  if (feedback === 'downgrade' && snapshot.previousLevelId) {
    return {
      kind: 'downgrade',
      nextLevelId: snapshot.previousLevelId,
      reason: 'המשתמש ביקש לרדת רמה',
      metaPatch: {
        current_level_id: snapshot.previousLevelId,
        current_level_started_at: now,
        success_streak_current_level: 0,
        success_days_current_level: 0,
        last_feedback: 'too_hard',
        last_feedback_at: now,
        recommended_streak_current: 0,
      },
    };
  }

  if (feedback === 'too_easy' || feedback === 'too_hard' || feedback === 'ok') {
    const patch: Partial<JourneyTaskLevelMeta> = {
      last_feedback: feedback,
      last_feedback_at: now,
    };
    if (feedback === 'too_easy' && snapshot.shouldSuggestLevelUp && snapshot.nextLevelId) {
      patch.level_up_suggested_at = now;
    }
    return { kind: 'none', nextLevelId: null, reason: 'feedback_recorded', metaPatch: patch };
  }

  if (snapshot.shouldSuggestLevelUp && snapshot.nextLevelId) {
    return {
      kind: 'level_up',
      nextLevelId: snapshot.nextLevelId,
      reason: `רצף של ${snapshot.successStreakCurrentLevel} ימים ברמה הנוכחית`,
      metaPatch: { level_up_suggested_at: now },
    };
  }

  if (snapshot.shouldSuggestDowngrade && snapshot.previousLevelId) {
    return {
      kind: 'downgrade',
      nextLevelId: snapshot.previousLevelId,
      reason: 'קשה לך ברמה הנוכחית — אפשר לרדת רמה ולבנות מומנטום',
      metaPatch: {},
    };
  }

  return { kind: 'none', nextLevelId: null, reason: 'no_change', metaPatch: {} };
}
