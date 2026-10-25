/**
 * NuraWell subscription service: applies @saas/billing state-machine events to `subscriptions`.
 * All status logic lives in the package (transition / nextRetryAt / dunningExhausted); this file only does I/O.
 * Entering 'ended' sets ended_at, which is what the post-subscription retention purge keys on.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  transition, nextRetryAt, dunningExhausted, dunningDedupeKey,
  type BillingEventKind, type SubscriptionStatus, type PaymentProvider,
} from '@saas/billing';
import { PRODUCT_ID } from './platform';

export const DUNNING_RETRY_DAYS = [3, 7, 14];

type SubRow = { id: string; user_id: string; status: string; ended_at: string | null; dunning_attempt: number | null; dunning_first_failed_at: string | null; provider: string; provider_ref: string | null; plan_code: string | null };
const SUB_COLS = 'id, user_id, status, ended_at, dunning_attempt, dunning_first_failed_at, provider, provider_ref, plan_code';

/** Legacy rows use 'expired'; the package calls it 'ended'. */
export function normalizeStatus(s: string): SubscriptionStatus {
  return (s === 'expired' ? 'ended' : s) as SubscriptionStatus;
}

export type ApplyResult =
  | { ok: true; subscription_id: string; from: SubscriptionStatus; to: SubscriptionStatus }
  | { ok: false; error: 'no_subscription' | 'invalid_transition' | 'update_failed'; subscription_id?: string };

/** Pure: the row patch for a transition (exported for tests). */
export function buildPatch(sub: Pick<SubRow, 'status' | 'dunning_attempt' | 'dunning_first_failed_at'>, event: BillingEventKind, now: Date, retryDays = DUNNING_RETRY_DAYS) {
  const t = transition(normalizeStatus(sub.status), event);
  if (!t.ok) return null;
  const patch: Record<string, unknown> = { status: t.to, updated_at: now.toISOString() };
  if (t.setsEndedAt) patch.ended_at = now.toISOString();
  if (t.clearsEndedAt) { patch.ended_at = null; patch.cancel_at_period_end = false; }
  if (event === 'payment_failed') {
    const attempt = (sub.dunning_attempt ?? 0) + 1;
    const first = sub.dunning_first_failed_at ? new Date(sub.dunning_first_failed_at) : now;
    patch.dunning_attempt = attempt;
    patch.dunning_first_failed_at = first.toISOString();
    patch.next_retry_at = nextRetryAt(first, attempt, retryDays)?.toISOString() ?? now.toISOString();
  }
  if (t.to === 'active' || t.to === 'ended') {
    patch.dunning_attempt = 0; patch.dunning_first_failed_at = null; patch.next_retry_at = null;
  }
  if (event === 'cancel_requested') { patch.cancel_at_period_end = true; patch.canceled_at = now.toISOString(); }
  if (event === 'cancel_reverted') { patch.cancel_at_period_end = false; patch.canceled_at = null; }
  return { t, patch };
}

async function findSubscription(admin: SupabaseClient, by: { subscriptionId?: string; provider?: string; providerRef?: string; userId?: string }): Promise<SubRow | null> {
  let q = admin.from('subscriptions').select(SUB_COLS).eq('product_id', PRODUCT_ID);
  if (by.subscriptionId) q = q.eq('id', by.subscriptionId);
  else if (by.provider && by.providerRef) q = q.eq('provider', by.provider).eq('provider_ref', by.providerRef);
  else if (by.userId) q = q.eq('user_id', by.userId);
  else return null;
  const { data } = await q.order('created_at', { ascending: false }).limit(1).maybeSingle();
  return (data as SubRow | null) ?? null;
}

/** Apply one state-machine event. Idempotency is upstream (webhook store / dunning dedupe); invalid transitions are no-ops. */
export async function applyBillingEvent(
  admin: SupabaseClient,
  p: { event: BillingEventKind; subscriptionId?: string; provider?: string; providerRef?: string; userId?: string; now?: Date; source: 'webhook' | 'dunning' | 'admin' }
): Promise<ApplyResult> {
  const now = p.now ?? new Date();
  const sub = await findSubscription(admin, p);
  if (!sub) return { ok: false, error: 'no_subscription' };
  const built = buildPatch(sub, p.event, now);
  if (!built) return { ok: false, error: 'invalid_transition', subscription_id: sub.id };
  // Optimistic: only update if the status is still what we read (concurrent webhook + cron).
  const { data, error } = await admin.from('subscriptions').update(built.patch).eq('id', sub.id).eq('status', sub.status).select('id');
  if (error || !data?.length) return { ok: false, error: 'update_failed', subscription_id: sub.id };
  await admin.from('billing_events').insert({ product_id: PRODUCT_ID, user_id: sub.user_id, subscription_id: sub.id, kind: p.event, metadata: { source: p.source, from: built.t.from, to: built.t.to } })
    .then(() => undefined, () => undefined);
  return { ok: true, subscription_id: sub.id, from: built.t.from, to: built.t.to };
}

export type DunningResult = { candidates: number; recovered: number; retried_failed: number; ended: number; notified: number; errors: number };

type DunningDeps = {
  provider: PaymentProvider | null;
  notify: (admin: SupabaseClient, userId: string, subscriptionId: string, attempt: number) => Promise<boolean>;
};

async function defaultDunningDeps(): Promise<DunningDeps> {
  const { insertNotification } = await import('@/lib/notifications/deliver');
  const { isUserNotifyEligible } = await import('@/lib/notifications/notify-recipients');
  return {
    provider: null,
    notify: async (admin, userId, subscriptionId, attempt) => {
      if (!(await isUserNotifyEligible(admin, userId))) return false; // admin/test accounts need explicit opt-in
      const r = await insertNotification(admin, {
        user_id: userId,
        type: 'system',
        title: 'התשלום על המנוי לא עבר',
        body: 'ננסה שוב בימים הקרובים. כדאי לבדוק את אמצעי התשלום באזור המנוי כדי שהליווי יימשך בלי הפסקה.',
        metadata: { source: 'billing_dunning', kind: 'dunning_notice', attempt, url: '/settings/subscription' },
      }, { idempotencyKey: dunningDedupeKey(subscriptionId, attempt) });
      return (r as { ok?: boolean }).ok !== false;
    },
  };
}

/**
 * Nightly dunning (flag-gated by the caller). For past_due subscriptions whose retry is due:
 * exhausted → 'dunning_exhausted' (ends it, which starts post-subscription retention);
 * otherwise retry the charge through the provider if one is implemented, and send one notice per attempt (dedupe key).
 */
export async function runDunning(admin: SupabaseClient, opts: { now?: Date; limit?: number; retryDays?: number[]; deps?: DunningDeps } = {}): Promise<DunningResult> {
  const now = opts.now ?? new Date();
  const retryDays = opts.retryDays ?? DUNNING_RETRY_DAYS;
  const deps = opts.deps ?? (await defaultDunningDeps());
  const out: DunningResult = { candidates: 0, recovered: 0, retried_failed: 0, ended: 0, notified: 0, errors: 0 };
  const { data, error } = await admin.from('subscriptions').select(SUB_COLS)
    .eq('product_id', PRODUCT_ID).eq('status', 'past_due').lte('next_retry_at', now.toISOString())
    .order('next_retry_at', { ascending: true }).limit(opts.limit ?? 100);
  if (error) throw new Error('dunning_load_failed');
  const rows = (data ?? []) as SubRow[];
  out.candidates = rows.length;
  for (const s of rows) {
    const attempt = s.dunning_attempt ?? 1;
    if (dunningExhausted(attempt, retryDays)) {
      const r = await applyBillingEvent(admin, { event: 'dunning_exhausted', subscriptionId: s.id, now, source: 'dunning' });
      if (r.ok) out.ended++; else out.errors++;
      continue;
    }
    let charged: boolean | null = null;
    if (deps.provider?.implemented && s.provider === deps.provider.name && s.provider_ref && s.plan_code) {
      const { data: plan } = await admin.from('billing_plans').select('price_agorot').eq('product_id', PRODUCT_ID).eq('code', s.plan_code).maybeSingle();
      const amount = (plan as { price_agorot?: number } | null)?.price_agorot;
      if (amount && amount > 0) {
        const res = await deps.provider.chargeRecurring({ providerRef: s.provider_ref, amountAgorot: amount, idempotencyKey: `${dunningDedupeKey(s.id, attempt)}:charge` }).catch(() => null);
        charged = res?.ok === true;
      }
    }
    if (charged) {
      const r = await applyBillingEvent(admin, { event: 'payment_recovered', subscriptionId: s.id, now, source: 'dunning' });
      if (r.ok) out.recovered++; else out.errors++;
      continue;
    }
    // Retry failed or no provider to retry with: count the failure (advances attempt + next_retry_at) and notify once.
    const r = await applyBillingEvent(admin, { event: 'payment_failed', subscriptionId: s.id, now, source: 'dunning' });
    if (!r.ok) { out.errors++; continue; }
    out.retried_failed++;
    if (await deps.notify(admin, s.user_id, s.id, attempt).catch(() => false)) out.notified++;
  }
  await admin.from('admin_audit_log').insert({ actor_id: null, method: 'CRON', path: 'billing_dunning', detail: { ...out } }).then(() => undefined, () => undefined);
  return out;
}
