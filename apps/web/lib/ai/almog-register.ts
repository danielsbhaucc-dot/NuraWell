import type { SupabaseClient } from '@supabase/supabase-js';
import { deriveAlmogRegister, type AlmogRegister } from './almog-voice';

/** Read the user's persisted register, update it from their latest message (sticky), never throw. */
export async function resolveAlmogRegister(db: SupabaseClient, userId: string, userText: string): Promise<AlmogRegister> {
  try {
    const { data } = await db.from('profiles').select('almog_register').eq('id', userId).maybeSingle();
    const prev = ((data as { almog_register?: string | null } | null)?.almog_register ?? null) as AlmogRegister | null;
    const next = deriveAlmogRegister(userText, prev);
    if (next !== prev) await db.from('profiles').update({ almog_register: next }).eq('id', userId);
    return next;
  } catch {
    return 'casual';
  }
}

export async function readAlmogRegister(db: SupabaseClient, userId: string): Promise<AlmogRegister> {
  const { data } = await db.from('profiles').select('almog_register').eq('id', userId).maybeSingle();
  return (data as { almog_register?: string | null } | null)?.almog_register === 'formal' ? 'formal' : 'casual';
}
