'use server';

import { createClient } from '@/lib/supabase/server';

/**
 * Generic helper: sets a `*_welcome_seen_at` timestamp on the current user's profile.
 * Returns `{ ok, userId }` so callers can trigger follow-up side-effects (e.g. email).
 */
export async function markWelcomeSeen(
  column: string
): Promise<{ ok: true; userId: string } | { ok: false }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await supabase
    .from('profiles')
    .update({ [column]: new Date().toISOString() })
    .eq('id', user.id);

  if (error) return { ok: false };
  return { ok: true, userId: user.id };
}
