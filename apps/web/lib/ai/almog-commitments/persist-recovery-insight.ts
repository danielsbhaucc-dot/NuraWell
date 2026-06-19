/**
 * שמירת תובנות recovery לזיכרון ארוך טווח + interventions.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchUserMemoryDossier, upsertUserMemoryDossier } from '../memory-dossier/fetch-dossier';
import { mergeDossierPatch } from '../memory-dossier/merge-dossier';
import { EMPTY_DOSSIER } from '../memory-dossier/types';

export type RecoveryInsightInput = {
  userId: string;
  taskTitle: string;
  journeyTaskId?: string | null;
  stepId?: string | null;
  kind: 'easy' | 'ok' | 'hard' | 'inquiry' | 'plan_created' | 'pivot' | 'graduated' | 'no_response';
  strategy?: string | null;
  strategyType?: string | null;
  outcome?: 'helped' | 'not_helped' | 'pending';
  note: string;
  blockerId?: string | null;
};

export async function persistRecoveryInsight(
  admin: SupabaseClient,
  input: RecoveryInsightInput
): Promise<void> {
  const nowIso = new Date().toISOString();

  if (input.blockerId && input.strategy && input.outcome) {
    await admin.from('almog_interventions').insert({
      user_id: input.userId,
      blocker_id: input.blockerId,
      barrier_type: 'motivational',
      strategy: input.strategy,
      strategy_type: input.strategyType ?? 'micro_habit',
      outcome: input.outcome,
      metadata: {
        source: 'recovery_insight',
        journey_task_id: input.journeyTaskId ?? null,
        kind: input.kind,
      },
    });
  }

  const existing = await fetchUserMemoryDossier(admin, input.userId).catch(() => ({
    ...EMPTY_DOSSIER,
    user_id: input.userId,
  }));

  const insightText = `${input.taskTitle}: ${input.note}`.slice(0, 220);
  const taskMemoryPatch: Record<string, unknown> = {};
  if (input.journeyTaskId) {
    taskMemoryPatch[input.journeyTaskId] = {
      last_recovery_kind: input.kind,
      last_strategy: input.strategy ?? null,
      last_outcome: input.outcome ?? input.kind,
      updated_at: nowIso,
    };
  }

  const merged = mergeDossierPatch(existing, input.userId, {
    inferred_insights: [
      {
        text: insightText,
        category: 'coaching',
        confidence: 0.85,
        source: 'recovery_orchestrator',
        created_at: nowIso,
      },
    ],
    task_memory: taskMemoryPatch,
    ai_context_patch: {
      last_recovery_note: insightText.slice(0, 120),
    },
  });

  await upsertUserMemoryDossier(admin, merged).catch(() => null);
}
