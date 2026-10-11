import type { SupabaseClient } from '@supabase/supabase-js';
import { billingEnforced, FREE_STATIONS, TIERS, type Feature, type Tier, type BillingInterval } from './tiers';

export type SubscriptionRow = {
  id: string;
  user_id: string;
  tier: Tier;
  billing_interval: BillingInterval | null;
  status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'expired';
  provider: string;
  trial_ends_at: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
};

export type Entitlements = {
  tier: Tier;
  source: 'subscription' | 'trial' | 'free' | 'staff' | 'not_enforced';
  subscription: SubscriptionRow | null;
  trialUsed: boolean;
  features: Feature[];
  enforced: boolean;
};

const SUB_COLS = 'id, user_id, tier, billing_interval, status, provider, trial_ends_at, current_period_end, cancel_at_period_end';

/** Pure: which subscription row (if any) grants access right now. */
export function effectiveSubscription(rows: SubscriptionRow[], now = new Date()): SubscriptionRow | null {
  const t = now.getTime();
  const live = rows.filter((r) => {
    if (r.status === 'trialing') return !!r.trial_ends_at && Date.parse(r.trial_ends_at) > t;
    if (r.status === 'active' || r.status === 'past_due' || r.status === 'canceled')
      return !r.current_period_end || Date.parse(r.current_period_end) > t; // canceled = until period end
    return false;
  });
  const rank: Record<Tier, number> = { pro: 2, premium: 1, free: 0 };
  return live.sort((a, b) => rank[b.tier] - rank[a.tier])[0] ?? null;
}

export function computeEntitlements(
  rows: SubscriptionRow[],
  role: string | null | undefined,
  opts: { now?: Date; enforced?: boolean } = {}
): Entitlements {
  const enforced = opts.enforced ?? billingEnforced();
  const sub = effectiveSubscription(rows, opts.now);
  const trialUsed = rows.some((r) => r.trial_ends_at);
  if (role === 'admin' || role === 'test') {
    return { tier: 'pro', source: 'staff', subscription: sub, trialUsed, features: TIERS.pro.features, enforced };
  }
  const tier: Tier = sub?.tier ?? 'free';
  const source = sub ? (sub.status === 'trialing' ? 'trial' : 'subscription') : 'free';
  if (!enforced) {
    return { tier, source: sub ? source : 'not_enforced', subscription: sub, trialUsed, features: TIERS.pro.features, enforced };
  }
  return { tier, source, subscription: sub, trialUsed, features: TIERS[tier].features, enforced };
}

export async function getEntitlements(admin: SupabaseClient, userId: string, now = new Date()): Promise<Entitlements> {
  const [{ data: rows }, { data: profile }] = await Promise.all([
    admin.from('subscriptions').select(SUB_COLS).eq('user_id', userId).order('created_at', { ascending: false }).limit(20),
    admin.from('profiles').select('role').eq('id', userId).maybeSingle(),
  ]);
  return computeEntitlements((rows ?? []) as SubscriptionRow[], (profile as { role?: string } | null)?.role, { now });
}

export function hasFeature(e: Entitlements, f: Feature): boolean {
  return e.features.includes(f);
}

/** Content gating: free users get the first FREE_STATIONS stations (by order index, 0-based). */
export function canAccessStation(e: Entitlements, stationIndex: number): boolean {
  return hasFeature(e, 'journey_all_stations') || stationIndex < FREE_STATIONS;
}
