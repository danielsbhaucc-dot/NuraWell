/**
 * אורקסטרטור recovery מאוחד — זיהוי קושי, תזכורות, תוכנית AI, זיכרון, graduation.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProgressRow } from '../../workflows/habit-checkpoint-batch';
import { bridgeJourneyDifficultyToRecoveryPlan } from './bridge-journey-recovery';
import { detectJourneyStruggles, type StruggleSignal } from './struggle-detection';
import { fetchUserRecoveryState } from './recovery-state';
import { persistRecoveryInsight } from './persist-recovery-insight';
import { scheduleStruggleInquiry, scheduleRecoveryNoReplyFollowUp } from './recovery-plan-engine';
import {
  detectUnansweredRecoverySignals,
  type UnansweredRecoverySignal,
} from './recovery-response-detection';
import { parseJourneyTasksFull } from '../../journey/journey-report-parse';
import { tryGraduateJourneyRecovery } from '../../journey/graduate-journey-recovery';
import { applyPivotOverride } from '../orchestrator/daily-action-instances';
import type { UserMealProfile } from '../../journey/task-schedule';

export type RecoveryOrchestrationResult = {
  userId: string;
  struggles: number;
  inquiries_scheduled: number;
  plans_created: number;
  graduated: number;
  no_reply_detected: number;
  follow_ups_scheduled: number;
  errors: string[];
};

async function loadUserProgressRows(
  admin: SupabaseClient,
  userId: string
): Promise<ProgressRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await admin
    .from('journey_progress')
    .select(
      `
      user_id,
      step_id,
      updated_at,
      is_completed,
      task_statuses,
      task_level_meta,
      habits_progress,
      journey_steps ( title, habits, tasks, journey_stations ( title ) )
    `
    )
    .eq('user_id', userId)
    .eq('is_completed', false);

  return (data ?? []) as ProgressRow[];
}

type ExecutionRow = {
  task_id: string;
  date_key: string;
  slot: string;
  outcome?: string | null;
  step_id?: string | null;
};

async function finalizeRecoveryBridge(
  admin: SupabaseClient,
  userId: string,
  bridge: Awaited<ReturnType<typeof bridgeJourneyDifficultyToRecoveryPlan>>,
  insight: {
    taskTitle: string;
    journeyTaskId: string;
    stepId: string;
    kind: 'plan_created';
    note: string;
    blockerId?: string | null;
  },
  originalTitle: string
): Promise<boolean> {
  if (!bridge.assignment_id) return false;

  const { data: eased } = await admin
    .from('almog_assignments')
    .select('title')
    .eq('id', bridge.assignment_id)
    .maybeSingle();
  const microTitle = (eased as { title?: string } | null)?.title ?? originalTitle;

  await applyPivotOverride(admin, userId, {
    displayTitle: microTitle,
    originalTitle,
    proposalId: bridge.blocker_id ?? null,
  }).catch(() => null);

  await persistRecoveryInsight(admin, {
    userId,
    taskTitle: insight.taskTitle,
    journeyTaskId: insight.journeyTaskId,
    stepId: insight.stepId,
    kind: insight.kind,
    strategy: bridge.assignment_id,
    outcome: 'pending',
    note: insight.note,
    blockerId: insight.blockerId ?? bridge.blocker_id ?? null,
  });

  return true;
}

async function loadExecutions(admin: SupabaseClient, userId: string): Promise<ExecutionRow[]> {
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await admin
    .from('journey_task_executions')
    .select('task_id, date_key, slot, outcome, step_id')
    .eq('user_id', userId)
    .gte('completed_at', since)
    .limit(800);
  return Array.isArray(data) ? data : [];
}

async function handleStruggleSignal(
  admin: SupabaseClient,
  signal: StruggleSignal,
  recoveryState: Awaited<ReturnType<typeof fetchUserRecoveryState>>,
  progressRows: ProgressRow[],
  executions: ExecutionRow[],
  dryRun: boolean
): Promise<{ inquiry?: boolean; plan?: boolean }> {
  if (dryRun) return {};

  if (recoveryState.tracks.some((t) => t.journeyTaskId === signal.taskId)) {
    return {};
  }

  if (signal.severity === 'inquiry') {
    const track = recoveryState.tracks.find((t) => t.journeyTaskId === signal.taskId);
    const res = await scheduleStruggleInquiry({
      admin,
      userId: signal.userId,
      signalKind: signal.kind,
      taskTitle: signal.taskTitle,
      journeyTaskId: signal.taskId,
      stepId: signal.stepId,
      assignmentId: track?.easedAssignmentId ?? null,
      blockerId: track?.blockerId ?? null,
      expectedToday: signal.expectedToday,
      reportedToday: signal.reportedToday,
    });
    if (res.scheduled) {
      await persistRecoveryInsight(admin, {
        userId: signal.userId,
        taskTitle: signal.taskTitle,
        journeyTaskId: signal.taskId,
        stepId: signal.stepId,
        kind: 'inquiry',
        note: `זוהה ${signal.kind}: ${signal.reportedToday}/${signal.expectedToday} היום`,
      });
    }
    return { inquiry: res.scheduled };
  }

  const progressRow = progressRows.find((r) => r.step_id === signal.stepId);
  const taskLevelMeta = progressRow?.task_level_meta ?? {};
  const taskExecs = executions.filter(
    (e) => e.task_id === signal.taskId && (!e.step_id || e.step_id === signal.stepId)
  );

  const bridge = await bridgeJourneyDifficultyToRecoveryPlan({
    admin,
    userId: signal.userId,
    stepId: signal.stepId,
    task: signal.task,
    taskLevelMeta,
    executions: taskExecs,
    triggerSignal: signal.kind,
    expectedToday: signal.expectedToday,
    reportedToday: signal.reportedToday,
  });

  const planned = await finalizeRecoveryBridge(
    admin,
    signal.userId,
    bridge,
    {
      taskTitle: signal.taskTitle,
      journeyTaskId: signal.taskId,
      stepId: signal.stepId,
      kind: 'plan_created',
      note: `נוצרה תוכנית מותאמת אחרי ${signal.kind}`,
      blockerId: bridge.blocker_id ?? null,
    },
    signal.task.title
  );

  return { plan: planned };
}

async function handleUnansweredRecovery(
  admin: SupabaseClient,
  signal: UnansweredRecoverySignal,
  progressRows: ProgressRow[],
  executions: ExecutionRow[],
  dryRun: boolean,
  activeRecovery: ReadonlySet<string>
): Promise<{ follow_up?: boolean; plan?: boolean }> {
  if (dryRun) return {};

  if (
    signal.journeyTaskId &&
    activeRecovery.has(signal.journeyTaskId) &&
    signal.severity === 'escalate_plan'
  ) {
    return {};
  }

  if (signal.severity === 'follow_up') {
    const res = await scheduleRecoveryNoReplyFollowUp({
      admin,
      userId: signal.userId,
      taskTitle: signal.taskTitle,
      journeyTaskId: signal.journeyTaskId,
      stepId: signal.stepId,
      assignmentId: signal.assignmentId,
      blockerId: signal.blockerId,
      hoursSince: signal.hoursSince,
    });
    if (res.scheduled) {
      await persistRecoveryInsight(admin, {
        userId: signal.userId,
        taskTitle: signal.taskTitle,
        journeyTaskId: signal.journeyTaskId,
        stepId: signal.stepId,
        kind: 'no_response',
        note: `לא ענה לשאילתה אחרי ${Math.round(signal.hoursSince)} שעות — נדנוד עדין`,
      });
    }
    return { follow_up: res.scheduled };
  }

  if (signal.severity !== 'escalate_plan' || !signal.journeyTaskId || !signal.stepId) {
    return {};
  }

  const progressRow = progressRows.find((r) => r.step_id === signal.stepId);
  const task = parseJourneyTasksFull(progressRow?.journey_steps?.tasks).find(
    (t) => t.id === signal.journeyTaskId
  );
  if (!task) return {};

  const taskExecs = executions.filter(
    (e) =>
      e.task_id === signal.journeyTaskId &&
      (!e.step_id || e.step_id === signal.stepId)
  );

  const bridge = await bridgeJourneyDifficultyToRecoveryPlan({
    admin,
    userId: signal.userId,
    stepId: signal.stepId,
    task,
    taskLevelMeta: progressRow?.task_level_meta ?? {},
    executions: taskExecs,
  });

  const planned = await finalizeRecoveryBridge(
    admin,
    signal.userId,
    bridge,
    {
      taskTitle: signal.taskTitle,
      journeyTaskId: signal.journeyTaskId,
      stepId: signal.stepId,
      kind: 'plan_created',
      note: 'לא ענה לשאילתה — הופעלה תוכנית מותאמת אוטומטית',
      blockerId: bridge.blocker_id ?? null,
    },
    task.title
  );

  return { plan: planned };
}

export async function runRecoveryOrchestrationForUser(
  admin: SupabaseClient,
  userId: string,
  opts: {
    now?: Date;
    dryRun?: boolean;
    mealProfile?: UserMealProfile | null;
  } = {}
): Promise<RecoveryOrchestrationResult> {
  const dryRun = opts.dryRun ?? false;
  const result: RecoveryOrchestrationResult = {
    userId,
    struggles: 0,
    inquiries_scheduled: 0,
    plans_created: 0,
    graduated: 0,
    no_reply_detected: 0,
    follow_ups_scheduled: 0,
    errors: [],
  };

  try {
    const [rows, executions, recoveryState] = await Promise.all([
      loadUserProgressRows(admin, userId),
      loadExecutions(admin, userId),
      fetchUserRecoveryState(admin, userId),
    ]);

    if (!rows.length) return result;

    const activeRecovery = new Set(recoveryState.tracks.map((t) => t.journeyTaskId));
    const signals = detectJourneyStruggles({
      userId,
      progressRows: rows,
      executions,
      now: opts.now,
      mealProfile: opts.mealProfile,
      activeRecoveryTaskIds: activeRecovery,
    });

    result.struggles = signals.length;

    for (const signal of signals) {
      try {
        const handled = await handleStruggleSignal(
          admin,
          signal,
          recoveryState,
          rows,
          executions,
          dryRun
        );
        if (handled.inquiry) result.inquiries_scheduled += 1;
        if (handled.plan) result.plans_created += 1;
      } catch (e) {
        result.errors.push(
          `${signal.taskId}: ${e instanceof Error ? e.message : String(e)}`
        );
      }
    }

    const unanswered = await detectUnansweredRecoverySignals(admin, userId, opts.now, {
      activeRecoveryTaskIds: activeRecovery,
    });
    result.no_reply_detected = unanswered.length;

    for (const u of unanswered) {
      try {
        const handled = await handleUnansweredRecovery(
          admin,
          u,
          rows,
          executions,
          dryRun,
          activeRecovery
        );
        if (handled.follow_up) result.follow_ups_scheduled += 1;
        if (handled.plan) result.plans_created += 1;
      } catch (e) {
        result.errors.push(
          `no-reply:${u.journeyTaskId ?? u.assignmentId}: ${e instanceof Error ? e.message : String(e)}`
        );
      }
    }

    if (!dryRun) {
      const grad = await tryGraduateJourneyRecovery(admin, userId, opts.now);
      result.graduated = grad.filter((g) => g.taskGraduated).length;
    }
  } catch (e) {
    result.errors.push(e instanceof Error ? e.message : String(e));
  }

  return result;
}

async function loadMealProfiles(
  admin: SupabaseClient,
  userIds: string[]
): Promise<Map<string, UserMealProfile>> {
  const out = new Map<string, UserMealProfile>();
  if (!userIds.length) return out;

  const { data } = await admin
    .from('profiles')
    .select('id, meal_count, meal_schedule')
    .in('id', userIds);

  for (const row of (data ?? []) as Array<{
    id: string;
    meal_count?: number | null;
    meal_schedule?: unknown;
  }>) {
    out.set(row.id, {
      meal_count: typeof row.meal_count === 'number' ? row.meal_count : null,
      meal_schedule: Array.isArray(row.meal_schedule)
        ? (row.meal_schedule as UserMealProfile['meal_schedule'])
        : null,
    });
  }
  return out;
}

export async function runRecoveryOrchestrationBatch(
  admin: SupabaseClient,
  opts: { now?: Date; dryRun?: boolean; limit?: number } = {}
): Promise<{
  processed: number;
  total_inquiries: number;
  total_plans: number;
  total_graduated: number;
  total_no_reply: number;
  total_follow_ups: number;
  errors: string[];
}> {
  const limit = Math.min(500, opts.limit ?? 200);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rows } = await admin
    .from('journey_progress')
    .select('user_id, updated_at')
    .eq('is_completed', false)
    .order('updated_at', { ascending: true })
    .limit(limit * 4);

  const userIds: string[] = [];
  const seen = new Set<string>();
  for (const row of (rows ?? []) as { user_id: string }[]) {
    if (seen.has(row.user_id)) continue;
    seen.add(row.user_id);
    userIds.push(row.user_id);
    if (userIds.length >= limit) break;
  }

  const mealProfiles = await loadMealProfiles(admin, userIds);

  let processed = 0;
  let total_inquiries = 0;
  let total_plans = 0;
  let total_graduated = 0;
  let total_no_reply = 0;
  let total_follow_ups = 0;
  const errors: string[] = [];

  for (const userId of userIds) {
    const r = await runRecoveryOrchestrationForUser(admin, userId, {
      ...opts,
      mealProfile: mealProfiles.get(userId) ?? null,
    });
    processed += 1;
    total_inquiries += r.inquiries_scheduled;
    total_plans += r.plans_created;
    total_graduated += r.graduated;
    total_no_reply += r.no_reply_detected;
    total_follow_ups += r.follow_ups_scheduled;
    errors.push(...r.errors);
  }

  return {
    processed,
    total_inquiries,
    total_plans,
    total_graduated,
    total_no_reply,
    total_follow_ups,
    errors: errors.slice(0, 30),
  };
}
