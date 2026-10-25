import type { Plan, SubscriptionStatus } from './types';
import { hasAccess } from './state-machine';

export type Entitlements = { planCode: string | null; active: boolean; features: Record<string, boolean | number> };

/** Server-side entitlement resolution. Features come from the plan config (DB), never from the client. */
export function resolveEntitlements(plan: Pick<Plan, 'code' | 'features'> | null, status: SubscriptionStatus | null, freeFeatures: Record<string, boolean | number> = {}): Entitlements {
  if (!plan || !status || !hasAccess(status)) return { planCode: null, active: false, features: { ...freeFeatures } };
  return { planCode: plan.code, active: true, features: { ...freeFeatures, ...plan.features } };
}

export function can(e: Entitlements, feature: string): boolean {
  const v = e.features[feature];
  return v === true || (typeof v === 'number' && v > 0);
}

export function quota(e: Entitlements, feature: string): number {
  const v = e.features[feature];
  return typeof v === 'number' ? v : v === true ? Infinity : 0;
}

/** Metered usage (e.g. phone minutes): remaining = included + purchased - used. */
export function remainingUsage(included: number, purchased: number, used: number): number {
  return Math.max(0, included + purchased - used);
}
