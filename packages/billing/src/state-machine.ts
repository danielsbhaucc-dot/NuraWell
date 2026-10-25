import type { SubscriptionStatus } from './types';

export type BillingEventKind =
  | 'trial_started' | 'activated' | 'renewed' | 'payment_failed' | 'payment_recovered'
  | 'cancel_requested' | 'cancel_reverted' | 'period_ended' | 'trial_ended' | 'dunning_exhausted'
  | 'refunded_and_ended' | 'admin_end' | 'admin_reactivate';

const T: Record<SubscriptionStatus, Partial<Record<BillingEventKind, SubscriptionStatus>>> = {
  trialing: { activated: 'active', trial_ended: 'ended', cancel_requested: 'canceled', admin_end: 'ended', refunded_and_ended: 'ended' },
  active: { renewed: 'active', payment_failed: 'past_due', cancel_requested: 'canceled', refunded_and_ended: 'ended', admin_end: 'ended', activated: 'active' },
  past_due: { payment_recovered: 'active', renewed: 'active', payment_failed: 'past_due', dunning_exhausted: 'ended', cancel_requested: 'canceled', admin_end: 'ended', refunded_and_ended: 'ended' },
  canceled: { cancel_reverted: 'active', period_ended: 'ended', admin_end: 'ended', refunded_and_ended: 'ended', activated: 'active' },
  ended: { activated: 'active', admin_reactivate: 'active' },
};

export type Transition = { ok: true; from: SubscriptionStatus; to: SubscriptionStatus; setsEndedAt: boolean; clearsEndedAt: boolean } | { ok: false; from: SubscriptionStatus; event: BillingEventKind; error: 'invalid_transition' };

/** Pure transition. Entering 'ended' sets ended_at (drives retention purge); leaving it clears ended_at. */
export function transition(from: SubscriptionStatus, event: BillingEventKind): Transition {
  const to = T[from]?.[event];
  if (!to) return { ok: false, from, event, error: 'invalid_transition' };
  return { ok: true, from, to, setsEndedAt: to === 'ended' && from !== 'ended', clearsEndedAt: from === 'ended' && to !== 'ended' };
}

/** Does this status grant access to paid features? */
export function hasAccess(status: SubscriptionStatus): boolean {
  return status === 'trialing' || status === 'active' || status === 'past_due' || status === 'canceled';
}
