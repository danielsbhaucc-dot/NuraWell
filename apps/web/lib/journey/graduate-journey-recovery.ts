/**
 * סיום מסלול recovery — שבוע הצלחה ברמה המומלצת → סגירת משימה / צעד במסע.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { parseJourneyTasksFull } from './journey-report-parse';
import {
  computeTaskLevelProgressSnapshot,
  coerceTaskExecutionsFromApi,
  isTaskLevelAtOrAboveRecommended,
} from './task-level-progress';
import { RECOMMENDED_SUCCESS_WEEK_DAYS } from '../ai/almog-commitments/recovery-plan-engine';
import { persistRecoveryInsight } from '../ai/almog-commitments/persist-recovery-insight';

export type GraduationResult = {
  taskGraduated: boolean;
  stepCompleted: boolean;
  stepId?: string;
  taskId?: string;
};

export async function tryGraduateJourneyRecovery(
  admin: SupabaseClient,
  userId: string,
  now: Date = new Date()
): Promise<GraduationResult[]> {
  const results: GraduationResult[] = [];
  const nowIso = now.toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rows } = await admin
    .from('journey_progress')
    .select('step_id, task_statuses, task_level_meta, is_completed, journey_steps ( tasks )')
    .eq('user_id', userId)
    .eq('is_completed', false);

  type ProgressGraduationRow = {
    step_id: string;
    task_statuses: unknown;
    task_level_meta: unknown;
    is_completed: boolean;
    journey_steps: { tasks: unknown } | null;
  };

  const progressRows = (rows ?? []) as unknown as ProgressGraduationRow[];

  if (!progressRows.length) return results;

  const stepIds = progressRows.map((r) => r.step_id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: allExecRows } = await admin
    .from('journey_task_executions')
    .select('step_id, task_id, date_key, slot, outcome')
    .eq('user_id', userId)
    .in('step_id', stepIds)
    .limit(2000);

  type ExecRow = {
    step_id: string;
    task_id: string;
    date_key: string;
    slot: string;
    outcome?: string | null;
  };

  const execByStep = new Map<string, ExecRow[]>();
  for (const row of (allExecRows ?? []) as unknown as ExecRow[]) {
    const list = execByStep.get(row.step_id) ?? [];
    list.push(row);
    execByStep.set(row.step_id, list);
  }

  for (const row of progressRows) {
    const tasks = parseJourneyTasksFull(row.journey_steps?.tasks);
    if (!tasks.length) continue;

    const statuses = (row.task_statuses ?? {}) as Record<
      string,
      { status?: string; execution_done?: boolean }
    >;

    const executions = execByStep.get(row.step_id) ?? [];
    let allAcceptedDone = true;

    for (const task of tasks) {
      const st = statuses[task.id];
      if (st?.status !== 'accepted') continue;
      if (st.execution_done === true) continue;

      if (!task.leveling?.levels?.length) {
        allAcceptedDone = false;
        continue;
      }

      const taskExecs = executions.filter((e) => e.task_id === task.id);
      const snapshot = computeTaskLevelProgressSnapshot({
        task,
        executions: coerceTaskExecutionsFromApi(taskExecs),
        taskLevelMeta: row.task_level_meta,
      });

      if (
        !snapshot.meta ||
        !snapshot.recommendedLevelId ||
        !snapshot.currentLevelId ||
        !isTaskLevelAtOrAboveRecommended(task.leveling, snapshot.currentLevelId)
      ) {
        allAcceptedDone = false;
        continue;
      }

      const streak = snapshot.habitStreakRecommendedLevel;
      if (streak < RECOMMENDED_SUCCESS_WEEK_DAYS) {
        allAcceptedDone = false;
        continue;
      }

      statuses[task.id] = {
        ...st,
        execution_done: true,
      };

      await persistRecoveryInsight(admin, {
        userId,
        taskTitle: task.title,
        journeyTaskId: task.id,
        stepId: row.step_id,
        kind: 'graduated',
        note: `השלים ${streak} ימים ברמה המומלצת — מוכן להתקדם`,
      });

      results.push({
        taskGraduated: true,
        stepCompleted: false,
        stepId: row.step_id,
        taskId: task.id,
      });
    }

    const accepted = tasks.filter((t) => statuses[t.id]?.status === 'accepted');
    const allDone =
      accepted.length > 0 && accepted.every((t) => statuses[t.id]?.execution_done === true);

    if (allDone) {
      await admin
        .from('journey_progress')
        .update({
          task_statuses: statuses,
          is_completed: true,
          completed_at: nowIso,
          updated_at: nowIso,
          last_engaged_at: nowIso,
        })
        .eq('user_id', userId)
        .eq('step_id', row.step_id);

      results.push({
        taskGraduated: true,
        stepCompleted: true,
        stepId: row.step_id,
      });
    } else if (results.some((r) => r.stepId === row.step_id && r.taskGraduated)) {
      await admin
        .from('journey_progress')
        .update({
          task_statuses: statuses,
          updated_at: nowIso,
          last_engaged_at: nowIso,
        })
        .eq('user_id', userId)
        .eq('step_id', row.step_id);
    }
  }

  return results;
}

