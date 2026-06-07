import { rowToDossier } from './format-dossier-prompt';
import type { UserMemoryDossier } from './types';

const DOSSIER_SELECT =
  'user_id, tags, essentials, goals, task_memory, habit_memory, schedule_memory, personal_context, health_context, psychology, coaching_profile, risk_signals, inferred_insights, source_stats, updated_at';

export async function fetchUserMemoryDossier(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string
): Promise<UserMemoryDossier | null> {
  try {
    const { data, error } = await supabase
      .from('user_memory_dossier')
      .select(DOSSIER_SELECT)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.warn('[memory-dossier] fetch failed', error.message);
      return null;
    }

    return rowToDossier((data as Record<string, unknown> | null) ?? null, userId);
  } catch {
    return null;
  }
}

export async function upsertUserMemoryDossier(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  dossier: UserMemoryDossier
): Promise<void> {
  const { error } = await supabase.from('user_memory_dossier').upsert(
    {
      user_id: dossier.user_id,
      tags: dossier.tags,
      essentials: dossier.essentials,
      goals: dossier.goals,
      task_memory: dossier.task_memory,
      habit_memory: dossier.habit_memory,
      schedule_memory: dossier.schedule_memory,
      personal_context: dossier.personal_context,
      health_context: dossier.health_context,
      psychology: dossier.psychology,
      coaching_profile: dossier.coaching_profile,
      risk_signals: dossier.risk_signals,
      inferred_insights: dossier.inferred_insights,
      source_stats: dossier.source_stats,
    },
    { onConflict: 'user_id' }
  );

  if (error) {
    throw new Error(`upsertUserMemoryDossier: ${error.message}`);
  }
}
