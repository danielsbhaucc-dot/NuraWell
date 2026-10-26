/**
 * Data for the (flag-gated) billing screens: checkout, "המנוי שלי" and Ops billing.
 * Pure helpers are exported for tests; prices always come from billing_plans.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { quoteCancellation, couponApplies, cyclePriceAgorot, type Coupon } from '@saas/billing';
import { PRODUCT_ID, loadPlans } from './platform';
import { normalizeStatus } from './subscription-service';

export type PlanLite = { code: string; nameHe: string; priceAgorot: number; interval: 'monthly' | 'annual' };

/** Monthly recurring revenue in agorot: active + past_due (still billable) subscriptions, annual plans / 12. */
export function mrrAgorot(subs: { status: string; plan_code: string | null }[], plans: PlanLite[]): number {
  const by = new Map(plans.map((p) => [p.code, p]));
  let sum = 0;
  for (const s of subs) {
    const st = normalizeStatus(s.status);
    if (st !== 'active' && st !== 'past_due') continue;
    const p = s.plan_code ? by.get(s.plan_code) : undefined;
    if (!p) continue;
    sum += p.interval === 'annual' ? Math.round(p.priceAgorot / 12) : p.priceAgorot;
  }
  return sum;
}

export function statusCounts(subs: { status: string }[]): Record<string, number> {
  const out: Record<string, number> = { trialing: 0, active: 0, past_due: 0, canceled: 0, ended: 0 };
  for (const s of subs) { const k = normalizeStatus(s.status); out[k] = (out[k] ?? 0) + 1; }
  return out;
}

type CouponRow = { product_id: string; code: string; percent_off: number; duration_cycles: number | null; valid_from: string | null; valid_until: string | null; max_redemptions: number | null; redeemed: number; active: boolean };

export async function loadCoupon(admin: SupabaseClient, code: string): Promise<Coupon | null> {
  const { data } = await admin.from('billing_coupons').select('*').eq('product_id', PRODUCT_ID).eq('code', code.trim().toUpperCase()).maybeSingle();
  const r = data as CouponRow | null;
  if (!r || !r.active) return null;
  if (r.max_redemptions != null && r.redeemed >= r.max_redemptions) return null;
  return { productId: r.product_id, code: r.code, percentOff: Number(r.percent_off), durationCycles: r.duration_cycles, validFrom: r.valid_from, validUntil: r.valid_until } as unknown as Coupon;
}

/** First-cycle quote for a plan + optional coupon. */
export function quoteFirstCycle(plan: PlanLite, coupon: Coupon | null, now = new Date()) {
  const applies = coupon ? couponApplies(coupon, 0, now) : false;
  const amount = cyclePriceAgorot(plan, applies ? coupon : null, 0, now);
  return { amountAgorot: amount, couponApplied: applies, listAgorot: plan.priceAgorot };
}

export async function loadPlansLite(admin: SupabaseClient): Promise<PlanLite[]> {
  const plans = await loadPlans(admin);
  return (plans as unknown as PlanLite[]).map((p) => ({ code: p.code, nameHe: p.nameHe, priceAgorot: p.priceAgorot, interval: p.interval }));
}

/** The user's subscription with plan and a cancellation quote (14-day cooling-off vs end of period). */
export async function loadMySubscription(admin: SupabaseClient, userId: string, now = new Date()) {
  const { data: sub } = await admin.from('subscriptions')
    .select('id, status, plan_code, current_period_end, cancel_at_period_end, first_paid_at, ended_at, created_at')
    .eq('product_id', PRODUCT_ID).eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!sub) return { subscription: null };
  const plans = await loadPlansLite(admin);
  const plan = plans.find((p) => p.code === sub.plan_code) ?? null;
  const { data: pays } = await admin.from('billing_payments').select('amount_agorot, status, kind, created_at')
    .eq('subscription_id', sub.id).order('created_at', { ascending: false }).limit(12);
  const lastPaid = (pays ?? []).find((p) => p.kind === 'charge' && p.status === 'succeeded');
  const status = normalizeStatus(sub.status);
  const quote = lastPaid && (status === 'active' || status === 'past_due')
    ? quoteCancellation({ paidAgorot: lastPaid.amount_agorot, transactionAt: new Date(lastPaid.created_at), periodEnd: sub.current_period_end ? new Date(sub.current_period_end) : null, now })
    : null;
  return {
    subscription: { id: sub.id, status, plan, current_period_end: sub.current_period_end, cancel_at_period_end: !!sub.cancel_at_period_end, ended_at: sub.ended_at },
    payments: (pays ?? []).map((p) => ({ amount_agorot: p.amount_agorot, status: p.status, kind: p.kind, created_at: p.created_at })),
    cancellation: quote,
  };
}
