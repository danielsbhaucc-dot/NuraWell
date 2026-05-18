'use server';

import { createClient } from '@/lib/supabase/server';

export async function markDolevWelcomeSeen(): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('profiles')
    .update({ dolev_welcome_seen_at: new Date().toISOString() })
    .eq('id', user.id);

  return { ok: !error };
}
