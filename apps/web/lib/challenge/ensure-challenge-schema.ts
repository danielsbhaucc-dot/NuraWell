import type { SupabaseClient } from '@supabase/supabase-js';

export function isSupabaseSchemaCacheError(message: string): boolean {
  return /schema cache|could not find the '/i.test(message);
}

/** מתקן סכמת challenge חסרה (069–071) — service-role בלבד. */
export async function ensureChallengeOpsSchema(
  admin: SupabaseClient,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await admin.rpc('ensure_challenge_ops_schema');
  if (!error) return { ok: true };

  if (/function.*does not exist|42883/i.test(error.message)) {
    return {
      ok: false,
      error: 'חסרה סכמת אתגר — הרץ מיגרציה 000075_challenge_ops_schema.sql ב-Supabase SQL Editor',
    };
  }

  return { ok: false, error: error.message };
}

/** מריץ ensure + פעולה — מנסה שוב פעם אחת אחרי schema cache error. */
export async function withChallengeSchemaRetry<T>(
  admin: SupabaseClient,
  run: () => PromiseLike<{ data: T | null; error: { message: string } | null }>,
): Promise<{ data: T | null; error: { message: string } | null; schemaError?: string }> {
  let result = await run();
  if (!result.error || !isSupabaseSchemaCacheError(result.error.message)) {
    return result;
  }

  const ensured = await ensureChallengeOpsSchema(admin);
  if (!ensured.ok) {
    return { data: null, error: null, schemaError: ensured.error ?? result.error.message };
  }

  result = await run();
  return result;
}
