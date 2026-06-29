import type { SupabaseClient } from '@supabase/supabase-js';
import { withChallengeSchemaRetry } from './ensure-challenge-schema';

type ChallengeEnabledRow = { challenge_enabled: boolean };

type SupabaseResult<T> = PromiseLike<{
  data: T | null;
  error: { message: string } | null;
}>;

export async function readChallengeEnabled(admin: SupabaseClient): Promise<{
  challenge_enabled: boolean;
  error?: string;
}> {
  const { data, error, schemaError } = await withChallengeSchemaRetry<ChallengeEnabledRow>(
    admin,
    () =>
      admin
        .from('site_settings')
        .select('challenge_enabled')
        .eq('id', 1)
        .maybeSingle() as SupabaseResult<ChallengeEnabledRow>,
  );

  if (schemaError) return { challenge_enabled: false, error: schemaError };
  if (error) return { challenge_enabled: false, error: error.message };

  return { challenge_enabled: Boolean(data?.challenge_enabled) };
}

export async function writeChallengeEnabled(
  admin: SupabaseClient,
  enabled: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const { error, schemaError } = await withChallengeSchemaRetry<null>(admin, () =>
    admin
      .from('site_settings')
      .update({ challenge_enabled: enabled, updated_at: new Date().toISOString() })
      .eq('id', 1) as SupabaseResult<null>,
  );

  if (schemaError) return { ok: false, error: schemaError };
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
