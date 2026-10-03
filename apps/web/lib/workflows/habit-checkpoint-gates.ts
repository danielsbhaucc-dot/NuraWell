import type { SupabaseClient } from '@supabase/supabase-js';
import { gateAlmogUserFacingTouch } from '../notifications/almog-touch-send-gate';
import type { HabitCheckpointSlot } from './almog-habit-checkpoint-payload';

type NotifyMode = 'remind' | 'reinforce';

export type HabitCheckpointGate =
  | { ok: true }
  | {
      ok: false;
      reason: 'already_sent_this_slot' | 'touch_fatigue' | 'similar_habit_recent';
    };

export async function gateAlmogHabitCheckpoint(
  admin: SupabaseClient,
  userId: string,
  checkpointDate: string,
  slot: HabitCheckpointSlot,
  _notifyMode: NotifyMode = 'remind',
  habitIds: string[] = []
): Promise<HabitCheckpointGate> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: recent, error: nErr } = await admin
    .from('notifications')
    .select('metadata, created_at')
    .eq('user_id', userId)
    .eq('type', 'ai_message')
    .order('created_at', { ascending: false })
    .limit(40);

  if (nErr) throw new Error(nErr.message);

  const rows = (recent ?? []) as Array<{ metadata?: unknown; created_at?: string }>;

  const dup = rows.some((row) => {
    const m = row.metadata as Record<string, unknown> | null | undefined;
    return (
      m?.source === 'almog_habit_checkpoint' &&
      m?.checkpoint_date === checkpointDate &&
      m?.slot === slot
    );
  });

  if (dup) return { ok: false, reason: 'already_sent_this_slot' };

  // תקרת יום + similar-habit — אותו שער כמו כל שולחי אלמוג.
  const touchGate = await gateAlmogUserFacingTouch(admin, userId, { habitIds });
  if (!touchGate.ok) return touchGate;

  return { ok: true };
}
