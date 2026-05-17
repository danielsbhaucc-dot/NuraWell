import type { SupabaseClient } from '@supabase/supabase-js';
import { israelDateKey } from '../ai/onboarding-check-in-time';

export type OnboardingCheckInGateResult =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * מונע שליחה כפולה לאותו slot באותו יום (ישראל).
 */
export async function gateOnboardingCheckIn(
  admin: SupabaseClient,
  userId: string,
  checkInTime: string,
  checkpointDate: string
): Promise<OnboardingCheckInGateResult> {
  const today = israelDateKey();
  if (checkpointDate !== today) {
    return { ok: false, reason: 'checkpoint_date_not_today' };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from('notifications')
    .select('id, metadata, created_at')
    .eq('user_id', userId)
    .eq('type', 'ai_message')
    .gte('created_at', `${checkpointDate}T00:00:00+00:00`)
    .limit(20);

  if (error) return { ok: false, reason: `db_error:${error.message}` };

  for (const row of data ?? []) {
    const meta = (row as { metadata?: { source?: string; check_in_time?: string } }).metadata;
    const sent =
      meta?.source === 'almog_personalized_check_in' ||
      meta?.source === 'onboarding_check_in';
    if (sent && meta?.check_in_time === checkInTime) {
      return { ok: false, reason: 'already_sent_today' };
    }
  }

  return { ok: true };
}
