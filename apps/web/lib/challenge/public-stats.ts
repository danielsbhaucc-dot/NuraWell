import type { SupabaseClient } from '@supabase/supabase-js';

export type ChallengePublicStats = {
  active_participants: number;
  completed_participants: number;
};

export async function fetchChallengePublicStats(
  supabase: SupabaseClient,
): Promise<ChallengePublicStats> {
  const { data, error } = await supabase.rpc('challenge_public_stats');
  if (error || !data) {
    return { active_participants: 0, completed_participants: 0 };
  }
  const row = data as {
    active_participants?: number;
    completed_participants?: number;
  };
  return {
    active_participants: row.active_participants ?? 0,
    completed_participants: row.completed_participants ?? 0,
  };
}
