import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CrisisDetectionResult } from './crisis-detector';

export const CRISIS_NUDGE_PAUSE_HOURS = 72;

/** Log a crisis signal (category only — never the message text) and pause automatic nudges. */
export async function recordCrisisSignal(
  admin: SupabaseClient,
  userId: string,
  source: 'chat' | 'sos' | 'onboarding',
  crisis: Pick<CrisisDetectionResult, 'category' | 'severity'>
): Promise<void> {
  const until = new Date(Date.now() + CRISIS_NUDGE_PAUSE_HOURS * 3600_000).toISOString();
  const [a, b] = await Promise.all([
    admin.from('safety_events').insert({ user_id: userId, source, category: crisis.category ?? 'unknown', severity: crisis.severity }),
    admin.from('profiles').update({ notify_paused_until: until }).eq('id', userId),
  ]);
  if (a.error || b.error) console.warn('[safety] record failed', a.error?.message ?? b.error?.message);
}
