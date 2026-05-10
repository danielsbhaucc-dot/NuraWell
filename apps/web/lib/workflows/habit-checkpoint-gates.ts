import type { SupabaseClient } from '@supabase/supabase-js';
import type { HabitCheckpointSlot } from './almog-habit-checkpoint-payload';

export type HabitCheckpointGate =
  | { ok: true }
  | { ok: false; reason: 'avoid_push' | 'already_sent_this_slot' };

export async function gateAlmogHabitCheckpoint(
  admin: SupabaseClient,
  userId: string,
  checkpointDate: string,
  slot: HabitCheckpointSlot
): Promise<HabitCheckpointGate> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile, error: pErr } = await (admin as any)
    .from('profiles')
    .select('ai_context')
    .eq('id', userId)
    .maybeSingle();

  if (pErr) throw new Error(pErr.message);
  const ctx = (profile?.ai_context ?? null) as Record<string, unknown> | null;
  if (ctx?.avoid_push === true) {
    return { ok: false, reason: 'avoid_push' };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: recent, error: nErr } = await (admin as any)
    .from('notifications')
    .select('metadata')
    .eq('user_id', userId)
    .eq('type', 'ai_message')
    .order('created_at', { ascending: false })
    .limit(40);

  if (nErr) throw new Error(nErr.message);

  const dup = (recent ?? []).some((row: { metadata?: unknown }) => {
    const m = row.metadata as Record<string, unknown> | null | undefined;
    return (
      m?.source === 'almog_habit_checkpoint' &&
      m?.checkpoint_date === checkpointDate &&
      m?.slot === slot
    );
  });

  if (dup) return { ok: false, reason: 'already_sent_this_slot' };

  return { ok: true };
}
