import type { SupabaseClient } from '@supabase/supabase-js';

export type GuardianUserSettings = {
  opted_in: boolean;
  opted_in_at: string | null;
  muted_until: string | null;
};

function readGuardianObject(aiContext: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const g = aiContext?.guardian;
  if (g && typeof g === 'object' && !Array.isArray(g)) {
    return g as Record<string, unknown>;
  }
  return {};
}

export function readGuardianUserSettings(
  aiContext: Record<string, unknown> | null | undefined
): GuardianUserSettings {
  const g = readGuardianObject(aiContext);
  if (aiContext?.guardian_opted_in === true && g.opted_in !== false) {
    return {
      opted_in: true,
      opted_in_at: typeof g.opted_in_at === 'string' ? g.opted_in_at : null,
      muted_until: typeof g.muted_until === 'string' ? g.muted_until : null,
    };
  }
  return {
    opted_in: g.opted_in === true,
    opted_in_at: typeof g.opted_in_at === 'string' ? g.opted_in_at : null,
    muted_until: typeof g.muted_until === 'string' ? g.muted_until : null,
  };
}

export async function updateGuardianUserSettings(
  supabase: SupabaseClient,
  userId: string,
  patch: Partial<Pick<GuardianUserSettings, 'opted_in' | 'muted_until'>>
): Promise<GuardianUserSettings> {
  const { data: row } = await supabase.from('profiles').select('ai_context').eq('id', userId).maybeSingle();

  const ctx = ((row as { ai_context?: Record<string, unknown> } | null)?.ai_context ?? {}) as Record<
    string,
    unknown
  >;
  const prev = readGuardianObject(ctx);
  const nowIso = new Date().toISOString();

  const nextGuardian: Record<string, unknown> = { ...prev };

  if (patch.opted_in === true) {
    nextGuardian.opted_in = true;
    nextGuardian.opted_in_at = nowIso;
  } else if (patch.opted_in === false) {
    nextGuardian.opted_in = false;
  }

  if (patch.muted_until !== undefined) {
    if (patch.muted_until) nextGuardian.muted_until = patch.muted_until;
    else delete nextGuardian.muted_until;
  }

  const merged = {
    ...ctx,
    guardian: nextGuardian,
    guardian_opted_in: nextGuardian.opted_in === true,
  };

  const { error } = await supabase.from('profiles').update({ ai_context: merged }).eq('id', userId);
  if (error) throw error;

  return readGuardianUserSettings(merged);
}
