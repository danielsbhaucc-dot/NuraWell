import type { SupabaseClient } from '@supabase/supabase-js';
import { LEGAL_POLICY_VERSION } from './constants';

/**
 * Subscription-based retention of personal data.
 * While a subscription is active everything is kept. When it ends, the user's own choice applies:
 *  - delete_now: full account deletion (same path as "delete my account", incl. per-user key destruction)
 *  - keep_24m:   kept 24 months after ended_at in case they come back, then the same full deletion.
 * Users who never chose are treated as keep_24m (existing users before 2026-10-25).
 * A newer active subscription cancels any pending deletion automatically (only the latest row counts).
 */
export {
  RETENTION_CHOICES, DEFAULT_RETENTION_CHOICE, KEEP_MONTHS, REMINDER_DAYS_BEFORE,
  isRetentionChoice, addMonthsUtc, computePurgeAt, decideRetentionAction,
} from '@saas/billing';
export type { RetentionChoice, RetentionAction } from '@saas/billing';
import { isRetentionChoice, computePurgeAt, decideRetentionAction, type RetentionChoice } from '@saas/billing';
/** Text version of the choice wording shown to users. Bump when the wording changes. */
export const RETENTION_CHOICE_VERSION = '2026-10-25';

export type RetentionCandidate = {
  user_id: string;
  subscription_id: string;
  ended_at: string;
  choice: RetentionChoice;
  role: string | null;
  reminder_sent: boolean;
};

/** Records the choice as a consent (legal evidence, 7 years via consent_history) and caches it on the profile. */
export async function recordRetentionChoice(
  admin: SupabaseClient,
  params: { userId: string; choice: RetentionChoice; source: 'onboarding' | 'settings' | 'admin'; previous?: RetentionChoice | null }
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isRetentionChoice(params.choice)) return { ok: false, error: 'invalid_choice' };
  const now = new Date().toISOString();
  const { error } = await admin.from('user_consents').insert({
    user_id: params.userId,
    consent_type: 'post_subscription_retention',
    granted: true,
    policy_version: LEGAL_POLICY_VERSION,
    source: params.source,
    metadata: { choice: params.choice, text_version: RETENTION_CHOICE_VERSION, previous: params.previous ?? null },
  });
  if (error) return { ok: false, error: error.message };
  const { error: pErr } = await admin.from('profiles').update({ post_sub_retention: params.choice, post_sub_retention_at: now }).eq('id', params.userId);
  if (pErr) return { ok: false, error: pErr.message };
  return { ok: true };
}

export type SubscriptionRetentionResult = { dry_run: boolean; candidates: number; purged: number; reminded: number; failed: number; skipped_lock?: boolean };

type Deps = {
  deleteAccount: (admin: SupabaseClient, userId: string) => Promise<{ ok: boolean }>;
  notify: (admin: SupabaseClient, userId: string, purgeAt: Date) => Promise<void>;
  isEligibleForNotice: (admin: SupabaseClient, userId: string) => Promise<boolean>;
};

async function defaultDeps(): Promise<Deps> {
  const { deleteUserAccountCompletely } = await import('./delete-user-account');
  const { insertNotification } = await import('@/lib/notifications/deliver');
  const { isUserNotifyEligible } = await import('@/lib/notifications/notify-recipients');
  return {
    deleteAccount: deleteUserAccountCompletely,
    isEligibleForNotice: isUserNotifyEligible,
    notify: async (admin, userId, purgeAt) => {
      const date = purgeAt.toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' });
      await insertNotification(admin, {
        user_id: userId,
        type: 'system',
        title: 'המידע שלך יימחק בעוד כחודש',
        body: `בחרת לשמור את המידע שלך אחרי סיום המנוי. ב-${date} הוא יימחק לצמיתות. אם חוזרים לפני כן, הכול נשאר במקום.`,
        metadata: { source: 'subscription_retention', kind: 'retention_purge_notice', url: '/upgrade' },
      }, { idempotencyKey: `retention_purge_notice:${userId}:${purgeAt.toISOString().slice(0, 10)}` });
    },
  };
}

/**
 * Nightly (log-retention cron). Batched, idempotent: a purged user disappears from the candidate list,
 * a reminder is guarded by a unique billing_events row per subscription. Audit row has counts only.
 */
export async function runSubscriptionRetention(
  admin: SupabaseClient,
  opts: { dryRun?: boolean; now?: Date; limit?: number; deps?: Deps } = {}
): Promise<SubscriptionRetentionResult> {
  const now = opts.now ?? new Date();
  const dryRun = opts.dryRun ?? false;
  const deps = opts.deps ?? (await defaultDeps());
  const out: SubscriptionRetentionResult = { dry_run: dryRun, candidates: 0, purged: 0, reminded: 0, failed: 0 };

  const { data, error } = await admin.rpc('retention_purge_due', { p_limit: opts.limit ?? 200 });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as RetentionCandidate[];
  out.candidates = rows.length;

  for (const r of rows) {
    if (r.role === 'admin') continue; // never (also excluded in SQL)
    const action = decideRetentionAction(r, now);
    if (action === 'none') continue;
    if (dryRun) {
      if (action === 'purge') out.purged++;
      else out.reminded++;
      continue;
    }
    if (action === 'purge') {
      const res = await deps.deleteAccount(admin, r.user_id).catch(() => ({ ok: false }));
      if (res.ok) out.purged++;
      else out.failed++;
      continue;
    }
    // remind: claim the unique notice row first, so a second run never notifies twice
    const { error: claimErr } = await admin.from('billing_events').insert({ user_id: r.user_id, subscription_id: r.subscription_id, kind: 'retention_purge_notice' });
    if (claimErr) continue;
    out.reminded++;
    if (await deps.isEligibleForNotice(admin, r.user_id)) {
      await deps.notify(admin, r.user_id, computePurgeAt(r.choice, new Date(r.ended_at))).catch(() => undefined);
    }
  }

  await admin.from('admin_audit_log').insert({ actor_id: null, method: 'CRON', path: 'subscription_retention', detail: { ...out } }).then(() => undefined, () => undefined);
  return out;
}

/** Admin / future payment webhook: mark the user's latest subscription as ended (or reactivate it). */
export async function setSubscriptionEnded(
  admin: SupabaseClient,
  userId: string,
  endedAt: Date | null
): Promise<{ ok: true; subscription_id: string } | { ok: false; error: string }> {
  const { data: sub } = await admin.from('subscriptions').select('id').eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!sub) return { ok: false, error: 'no_subscription' };
  const patch = endedAt
    ? { status: 'expired', ended_at: endedAt.toISOString(), updated_at: new Date().toISOString() }
    : { status: 'active', ended_at: null, cancel_at_period_end: false, updated_at: new Date().toISOString() };
  const { error } = await admin.from('subscriptions').update(patch).eq('id', sub.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, subscription_id: sub.id as string };
}
