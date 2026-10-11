import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { LadderLevel } from './ladder';
import { respondToOffer } from './index';

export type StepTaskContent = {
  id: string;
  title?: string;
  description?: string;
  emoji?: string;
  schedule?: string;
  times_per_day?: number;
  leveling?: {
    levels?: Array<{ id: string; label: string; order: number; is_minimum_viable?: boolean; is_recommended?: boolean }>;
    recommended_level_id?: string | null;
  } | null;
};

/**
 * Admin-defined content → ladder. Step leveling levels (order ascending = easier→harder, as in
 * lib/journey/task-level-meta getNextLevelId) map to: recommended level (the lesson's original
 * target) = 0, easier = negative, harder = positive; the minimum-viable level is the floor.
 */
export function ladderFromStepTask(task: StepTaskContent): { ladder: LadderLevel[]; floor: number; max: number } {
  const levels = [...(task.leveling?.levels ?? [])].sort((a, b) => a.order - b.order);
  if (!levels.length) return { ladder: [], floor: -2, max: 0 };
  const baseId = task.leveling?.recommended_level_id ?? levels.find((l) => l.is_recommended)?.id ?? levels[levels.length - 1].id;
  const baseIdx = Math.max(0, levels.findIndex((l) => l.id === baseId));
  const ladder = levels.map((l, i) => ({ level: i - baseIdx, title: l.label, times_per_day: null }));
  const mvIdx = levels.findIndex((l) => l.is_minimum_viable);
  const floor = Math.min(0, (mvIdx >= 0 ? mvIdx : 0) - baseIdx);
  return { ladder, floor, max: levels.length - 1 - baseIdx };
}

export async function upsertStepTaskDefinition(admin: SupabaseClient, stepId: string, t: StepTaskContent): Promise<string | null> {
  const { ladder, floor, max } = ladderFromStepTask(t);
  const key = `step:${stepId}:${t.id}`;
  const { data } = await admin
    .from('task_definitions')
    .upsert(
      {
        stable_key: key,
        source: 'step',
        source_ref: t.id,
        step_id: stepId,
        habit_key: key,
        title: t.title ?? t.id,
        description: t.description ?? null,
        emoji: t.emoji ?? null,
        schedule: t.schedule ?? null,
        times_per_day: typeof t.times_per_day === 'number' ? t.times_per_day : null,
        ...(ladder.length ? { ladder, floor_level: floor, max_level: max } : {}),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'stable_key' }
    )
    .select('id')
    .single();
  return (data?.id as string) ?? null;
}

/**
 * Lesson task choice (journey_progress.task_statuses accepted/rejected) → unified assignments.
 * accepted → the task becomes the user's main task for that habit; rejected → declined.
 */
export async function applyStepTaskChoices(
  admin: SupabaseClient,
  params: { userId: string; stepId: string; statuses: Record<string, { status: string }> }
) {
  const decided = Object.entries(params.statuses).filter(([, v]) => v.status === 'accepted' || v.status === 'rejected');
  if (!decided.length) return 0;
  const { data: step } = await admin.from('journey_steps').select('tasks').eq('id', params.stepId).maybeSingle();
  const tasks = (Array.isArray(step?.tasks) ? step!.tasks : []) as StepTaskContent[];
  let n = 0;
  for (const [taskId, v] of decided) {
    const t = tasks.find((x) => x?.id === taskId);
    if (!t) continue;
    const defId = await upsertStepTaskDefinition(admin, params.stepId, t);
    if (!defId) continue;
    const { data: existing } = await admin
      .from('user_task_assignments')
      .select('status')
      .eq('user_id', params.userId)
      .eq('definition_id', defId)
      .maybeSingle();
    const want = v.status === 'accepted' ? 'accepted' : 'declined';
    if (existing?.status === want) continue; // idempotent: no duplicate accepted/declined events
    await respondToOffer(admin, { userId: params.userId, definitionId: defId, accept: v.status === 'accepted' });
    n++;
  }
  return n;
}
