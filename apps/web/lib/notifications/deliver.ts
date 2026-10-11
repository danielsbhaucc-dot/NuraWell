import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * 📬 Unified notification delivery — the ONE write path into `notifications` (the single log).
 *
 * All senders (habit checkpoints, check-ins, passive presence, reminders, companion nudges,
 * guardian, master cron celebrations/churn, life-context, orchestrator, task celebration,
 * challenge, admin transcript) call this instead of inserting directly.
 *
 *  - DB-level dedupe: unique violations (23505, e.g. idx_notifications_habit_checkpoint_dedupe /
 *    idx_notifications_check_in_dedupe) are flagged `deduped: true`.
 *  - Device push stays on the single push path: `afterAlmogInAppNotification` (honors
 *    notification_prefs.push and avoid_push).
 *  - Send decisions (recipient / prefs / inactivity fade / touch fatigue) happen BEFORE content
 *    generation via `gateAlmogUserFacingTouch` → `evaluateNotifyGate`.
 */
export type NotificationRow = Record<string, unknown> & {
  user_id: string;
  type: string;
  title: string;
  body: string;
};

export type DeliverResult<T = Record<string, unknown>> = {
  data: T | null;
  error: { message: string; code?: string } | null;
  deduped: boolean;
};

export async function insertNotification<T = Record<string, unknown>>(
  admin: SupabaseClient,
  row: NotificationRow,
  opts: { select?: string; single?: 'single' | 'maybeSingle' } = {}
): Promise<DeliverResult<T>> {
  const base = admin.from('notifications').insert(row);
  let res: { data: unknown; error: { message: string; code?: string } | null };
  if (opts.select) {
    const q = base.select(opts.select);
    res = (await (opts.single === 'maybeSingle' ? q.maybeSingle() : q.single())) as typeof res;
  } else {
    res = (await base) as unknown as typeof res;
  }
  // error is passed through unchanged (callers' existing handling stays identical);
  // `deduped` lets callers treat a unique violation as "already sent".
  return {
    data: (res.data ?? null) as T | null,
    error: res.error ?? null,
    deduped: res.error?.code === '23505',
  };
}
