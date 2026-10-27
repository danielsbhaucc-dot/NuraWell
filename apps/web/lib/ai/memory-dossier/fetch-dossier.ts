import { decryptDossierRow, encryptJson } from '@/lib/crypto/pii';
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

    return rowToDossier(
      decryptDossierRow((data as Record<string, unknown> | null) ?? null, userId),
      userId
    );
  } catch (e) {
    console.warn('[memory-dossier] fetch/decrypt failed', e instanceof Error ? e.message : 'unknown');
    return null;
  }
}

export async function upsertUserMemoryDossier(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  dossier: UserMemoryDossier
): Promise<void> {
  // After an explicit health-consent withdrawal, never write health facts back into the dossier.
  const { healthConsentStatus } = await import('@/lib/module-api/privacy-retention/lib-privacy-health-consent');
  if ((await healthConsentStatus(dossier.user_id)) === 'withdrawn') {
    const { scrubHealthJson } = await import('@/lib/module-api/privacy-retention/lib-privacy-health-memory');
    dossier = {
      ...dossier,
      health_context: {} as UserMemoryDossier['health_context'],
      essentials: (scrubHealthJson(dossier.essentials) ?? {}) as UserMemoryDossier['essentials'],
      goals: (scrubHealthJson(dossier.goals) ?? {}) as UserMemoryDossier['goals'],
      personal_context: (scrubHealthJson(dossier.personal_context) ?? {}) as UserMemoryDossier['personal_context'],
      inferred_insights: (scrubHealthJson(dossier.inferred_insights) ?? []) as UserMemoryDossier['inferred_insights'],
      tags: (scrubHealthJson(dossier.tags) ?? []) as UserMemoryDossier['tags'],
    };
  }
  const { sealRow } = await import('@/lib/security/field-crypto');
  const { error } = await supabase.from('user_memory_dossier').upsert(
    await sealRow('user_memory_dossier', dossier.user_id, dossier.user_id, {
      user_id: dossier.user_id,
      tags: dossier.tags,
      essentials: dossier.essentials,
      goals: dossier.goals,
      task_memory: dossier.task_memory,
      habit_memory: dossier.habit_memory,
      schedule_memory: dossier.schedule_memory,
      personal_context: encryptJson(dossier.personal_context, dossier.user_id),
      health_context: encryptJson(dossier.health_context, dossier.user_id),
      psychology: encryptJson(dossier.psychology, dossier.user_id),
      coaching_profile: dossier.coaching_profile,
      risk_signals: encryptJson(dossier.risk_signals, dossier.user_id),
      inferred_insights: dossier.inferred_insights,
      source_stats: dossier.source_stats,
    }),
    { onConflict: 'user_id' }
  );

  if (error) {
    throw new Error(`upsertUserMemoryDossier: ${error.message}`);
  }
}
