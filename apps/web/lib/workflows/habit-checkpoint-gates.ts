import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchTodayAlmogTouches } from '../ai/almog-notify-day-context';
import { shouldSkipNotifyForTouchFatigue } from '../ai/almog-daily-context';
import { isAvoidPushActive } from '../ai/avoid-push';
import type { HabitCheckpointSlot } from './almog-habit-checkpoint-payload';

type NotifyMode = 'remind' | 'reinforce';

export type HabitCheckpointGate =
  | { ok: true }
  | { ok: false; reason: 'avoid_push' | 'already_sent_this_slot' | 'touch_fatigue' };

export async function gateAlmogHabitCheckpoint(
  admin: SupabaseClient,
  userId: string,
  checkpointDate: string,
  slot: HabitCheckpointSlot,
  notifyMode: NotifyMode = 'remind'
): Promise<HabitCheckpointGate> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile, error: pErr } = await admin
    .from('profiles')
    .select('ai_context')
    .eq('id', userId)
    .maybeSingle();

  if (pErr) throw new Error(pErr.message);
  const ctx = (profile?.ai_context ?? null) as Record<string, unknown> | null;
  if (isAvoidPushActive(ctx)) {
    return { ok: false, reason: 'avoid_push' };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: recent, error: nErr } = await admin
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

  const todayTouches = await fetchTodayAlmogTouches(admin, userId);
  if (shouldSkipNotifyForTouchFatigue(todayTouches, notifyMode)) {
    return { ok: false, reason: 'touch_fatigue' };
  }

  return { ok: true };
}
