/**
 * גשר ממשוב קושי במסלול (journey) לתוכנית פעולה ב"התוכנית שלי".
 * כשמשתמש מדווח "קשה" — יוצרים חסם + צעד מקל מ-AI ומקפיאים את המשימה המקורית.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { JourneyTask, JourneyTaskDifficultyLevel } from '../../types/journey';
import { generateBlockerPivot } from './intervention-engine';
import { fetchInterventionMemory } from './intervention-engine';
import { normalizeFrictionCategory } from './friction';
import { getPreviousLevelId } from '../../journey/task-level-meta';
import {
  computeTaskLevelProgressSnapshot,
  recommendTaskLevelAdjustment,
} from '../../journey/task-level-progress';
import { applyTaskLevelMetaPatch } from '../../journey/task-level-meta';
import { resolveTaskSchedule } from '../../journey/task-schedule';

type Admin = SupabaseClient;

function dedupeKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

export async function bridgeJourneyDifficultyToRecoveryPlan(params: {
  admin: Admin;
  userId: string;
  stepId: string;
  task: JourneyTask;
  taskLevelMeta: unknown;
  executions: Array<{ task_id: string; date_key: string; slot: string; outcome?: string | null }>;
  now?: Date;
  triggerSignal?: string;
  expectedToday?: number;
  reportedToday?: number;
}): Promise<{ blocker_id?: string; assignment_id?: string; downgraded?: boolean }> {
  const now = params.now ?? new Date();
  const nowIso = now.toISOString();

  const snapshot = computeTaskLevelProgressSnapshot({
    task: params.task,
    executions: params.executions as Parameters<typeof computeTaskLevelProgressSnapshot>[0]['executions'],
    taskLevelMeta: params.taskLevelMeta,
  });

  const hasLeveling = Boolean(params.task.leveling?.levels?.length && snapshot.meta);
  let adjustment: ReturnType<typeof recommendTaskLevelAdjustment> = {
    kind: 'none',
    reason: '',
    nextLevelId: null,
    metaPatch: {},
  };
  let easedLevelId = 'no-level';
  let easedLevel: JourneyTaskDifficultyLevel | null = null;
  let currentLevel: JourneyTaskDifficultyLevel | null = null;
  let pivotMicroStep: string | null = null;

  if (hasLeveling && params.task.leveling) {
    adjustment = recommendTaskLevelAdjustment(snapshot, params.task, 'too_hard');
    let mergedMeta = applyTaskLevelMetaPatch(params.taskLevelMeta, params.task.id, adjustment.metaPatch);

    if (adjustment.kind === 'downgrade' && adjustment.nextLevelId) {
      mergedMeta = applyTaskLevelMetaPatch(mergedMeta, params.task.id, adjustment.metaPatch);
      await params.admin.from('journey_progress').upsert(
        {
          user_id: params.userId,
          step_id: params.stepId,
          task_level_meta: mergedMeta,
          updated_at: nowIso,
          last_engaged_at: nowIso,
        },
        { onConflict: 'user_id,step_id' }
      );
    }

    currentLevel =
      params.task.leveling.levels.find((l) => l.id === snapshot.currentLevelId) ?? null;
    easedLevelId =
      adjustment.kind === 'downgrade' && adjustment.nextLevelId
        ? adjustment.nextLevelId
        : getPreviousLevelId(params.task.leveling.levels, snapshot.currentLevelId ?? '') ??
          snapshot.currentLevelId ??
          'no-level';
    easedLevel = params.task.leveling.levels.find((l) => l.id === easedLevelId) ?? currentLevel;
  }

  const description = `קשה לי עם "${params.task.title}"${currentLevel ? ` (${currentLevel.label})` : ''}`;
  const blockerKey = dedupeKey(`journey|${params.stepId}|${params.task.id}|hard`);

  let blockerId: string | undefined;
  const { data: existingBlocker } = await params.admin
    .from('almog_blockers')
    .select('id')
    .eq('user_id', params.userId)
    .eq('dedupe_key', blockerKey)
    .maybeSingle();

  if (existingBlocker) {
    blockerId = (existingBlocker as { id: string }).id;
    await params.admin
      .from('almog_blockers')
      .update({ status: 'open', last_checked_at: nowIso })
      .eq('id', blockerId)
      .eq('user_id', params.userId);
  } else {
    const memory = await fetchInterventionMemory(params.admin, params.userId);
    const generated = await generateBlockerPivot({
      description,
      category: 'motivational',
      currentStrategy: easedLevel?.description ?? params.task.description ?? null,
      attemptCount: 0,
      memory,
      activeTasks: [{ ref: 'T1', title: params.task.title }],
      originalTaskTitle: params.task.title,
    });

    const microStep =
      generated.proposal.micro_step ||
      easedLevel?.description ||
      params.task.description ||
      params.task.title;
    pivotMicroStep = microStep;
    const { data: inserted } = await params.admin
      .from('almog_blockers')
      .insert({
        user_id: params.userId,
        description,
        strategy: microStep,
        category: normalizeFrictionCategory(generated.category),
        status: 'improving',
        dedupe_key: blockerKey,
        metadata: {
          source: 'journey_too_hard',
          step_id: params.stepId,
          task_id: params.task.id,
          coach: {
            empathy: generated.empathy,
            proposal: generated.proposal,
            generated_at: nowIso,
          },
        },
        history: [{ at: nowIso, status: 'improving', note: 'קשה — צעד מותאם מהשיעור' }],
      })
      .select('id')
      .maybeSingle();
    blockerId = (inserted as { id: string } | null)?.id;
  }

  if (!blockerId) return { downgraded: adjustment.kind === 'downgrade' };

  const { schedule } = resolveTaskSchedule(params.task);
  const taskKey = dedupeKey(`journey-ease|${params.stepId}|${params.task.id}|${easedLevelId}`);
  const microTitle =
    easedLevel?.description?.trim() ||
    easedLevel?.label ||
    pivotMicroStep ||
    params.task.title;

  const parentKey = dedupeKey(`journey-parent|${params.stepId}|${params.task.id}`);
  const { data: existingParent } = await params.admin
    .from('almog_assignments')
    .select('id, status')
    .eq('user_id', params.userId)
    .eq('dedupe_key', parentKey)
    .maybeSingle();

  let parentAssignmentId: string;
  if (existingParent) {
    parentAssignmentId = (existingParent as { id: string }).id;
    if ((existingParent as { status: string }).status !== 'frozen') {
      const { data: parentRow } = await params.admin
        .from('almog_assignments')
        .select('history')
        .eq('id', parentAssignmentId)
        .eq('user_id', params.userId)
        .maybeSingle();
      const pHist = Array.isArray((parentRow as { history?: unknown } | null)?.history)
        ? ((parentRow as { history: { at: string; action: string; note?: string }[] }).history)
        : [];
      await params.admin
        .from('almog_assignments')
        .update({
          status: 'frozen',
          history: [
            ...pHist,
            {
              at: nowIso,
              action: 'frozen',
              note: 'מתמקדים בצעד מותאם — המשימה המקורית מחכה בסבלנות',
            },
          ].slice(-50),
        })
        .eq('id', parentAssignmentId)
        .eq('user_id', params.userId);
    }
  } else {
    const { data: parentInsert } = await params.admin
      .from('almog_assignments')
      .insert({
        user_id: params.userId,
        title: params.task.title,
        reason: 'משימה מהשיעור',
        detail: currentLevel?.label ?? null,
        status: 'frozen',
        schedule: schedule === 'one_time' ? 'one_time' : 'daily',
        given_at: nowIso,
        related_step_id: params.stepId,
        relation: 'standalone',
        dedupe_key: parentKey,
        created_by: 'almog',
        metadata: {
          source: 'journey_original',
          journey_task_id: params.task.id,
          journey_schedule: schedule,
          frozen_empathy: true,
        },
        history: [
          {
            at: nowIso,
            action: 'frozen',
            note: 'מתמקדים בצעד מותאם — המשימה המקורית מחכה בסבלנות',
          },
        ],
      })
      .select('id')
      .maybeSingle();
    parentAssignmentId = (parentInsert as { id: string } | null)?.id ?? '';
  }

  let assignmentId: string | undefined;
  const { data: existingEase } = await params.admin
    .from('almog_assignments')
    .select('id')
    .eq('user_id', params.userId)
    .eq('dedupe_key', taskKey)
    .maybeSingle();

  if (existingEase) {
    assignmentId = (existingEase as { id: string }).id;
    await params.admin
      .from('almog_assignments')
      .update({
        status: 'active',
        title: microTitle,
        parent_assignment_id: parentAssignmentId || null,
        relation: 'eases',
        schedule: 'daily',
      })
      .eq('id', assignmentId)
      .eq('user_id', params.userId);
  } else {
    const { data: easeInsert } = await params.admin
      .from('almog_assignments')
      .insert({
        user_id: params.userId,
        title: microTitle,
        reason: `גרסה מותאמת ל"${params.task.title}"`,
        detail: easedLevel?.label ?? null,
        status: 'active',
        schedule: 'daily',
        given_at: nowIso,
        parent_assignment_id: parentAssignmentId || null,
        relation: 'eases',
        related_step_id: params.stepId,
        dedupe_key: taskKey,
        created_by: 'almog',
        metadata: {
          source: 'journey_eased',
          journey_task_id: params.task.id,
          journey_schedule: schedule,
          eased_level_id: easedLevelId,
          blocker_id: blockerId,
          ...(params.triggerSignal ? { signal_kind: params.triggerSignal } : {}),
          ...(params.expectedToday != null ? { expected: params.expectedToday } : {}),
          ...(params.reportedToday != null ? { reported: params.reportedToday } : {}),
        },
      })
      .select('id')
      .maybeSingle();
    assignmentId = (easeInsert as { id: string } | null)?.id;
  }

  if (assignmentId && blockerId) {
    await params.admin
      .from('almog_blockers')
      .update({ related_assignment_id: assignmentId })
      .eq('id', blockerId)
      .eq('user_id', params.userId);
  }

  return {
    blocker_id: blockerId,
    assignment_id: assignmentId,
    downgraded: adjustment.kind === 'downgrade',
  };
}

/** גשר מקבלת pivot מהאורקסטרטור → משימה אישית ב"התוכנית שלי" */
export async function bridgeOrchestratorPivotToAlmog(params: {
  admin: Admin;
  userId: string;
  microTitle: string;
  originalTitle: string | null;
  proposalId: string | null;
  now?: Date;
}): Promise<{ assignment_id?: string }> {
  const now = params.now ?? new Date();
  const nowIso = now.toISOString();
  const microTitle = params.microTitle.trim();
  if (!microTitle) return {};

  const taskKey = dedupeKey(`orchestrator-pivot|${params.proposalId ?? microTitle}`);
  const { data: existing } = await params.admin
    .from('almog_assignments')
    .select('id')
    .eq('user_id', params.userId)
    .eq('dedupe_key', taskKey)
    .maybeSingle();

  if (existing) {
    await params.admin
      .from('almog_assignments')
      .update({ status: 'active', title: microTitle })
      .eq('id', (existing as { id: string }).id)
      .eq('user_id', params.userId);
    return { assignment_id: (existing as { id: string }).id };
  }

  let parentAssignmentId: string | null = null;
  if (params.originalTitle?.trim()) {
    const parentKey = dedupeKey(`orchestrator-parent|${params.originalTitle}`);
    const { data: parentRow } = await params.admin
      .from('almog_assignments')
      .select('id')
      .eq('user_id', params.userId)
      .eq('dedupe_key', parentKey)
      .maybeSingle();
    if (parentRow) {
      parentAssignmentId = (parentRow as { id: string }).id;
    } else {
      const { data: parentInsert } = await params.admin
        .from('almog_assignments')
        .insert({
          user_id: params.userId,
          title: params.originalTitle.trim(),
          reason: 'יעד מקורי',
          status: 'frozen',
          schedule: 'daily',
          given_at: nowIso,
          relation: 'standalone',
          dedupe_key: parentKey,
          created_by: 'almog',
          metadata: { source: 'orchestrator_original', frozen_empathy: true },
          history: [
            {
              at: nowIso,
              action: 'frozen',
              note: 'מתמקדים בצעד מותאם מהאורקסטרטור',
            },
          ],
        })
        .select('id')
        .maybeSingle();
      parentAssignmentId = (parentInsert as { id: string } | null)?.id ?? null;
    }
  }

  const { data: easeInsert } = await params.admin
    .from('almog_assignments')
    .insert({
      user_id: params.userId,
      title: microTitle,
      reason: params.originalTitle ? `גרסה מותאמת ל"${params.originalTitle}"` : 'צעד מותאם',
      status: 'active',
      schedule: 'daily',
      given_at: nowIso,
      parent_assignment_id: parentAssignmentId,
      relation: parentAssignmentId ? 'eases' : 'standalone',
      dedupe_key: taskKey,
      created_by: 'almog',
      metadata: {
        source: 'orchestrator_pivot',
        proposal_id: params.proposalId,
        original_title: params.originalTitle,
      },
    })
    .select('id')
    .maybeSingle();

  return { assignment_id: (easeInsert as { id: string } | null)?.id };
}
