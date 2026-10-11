import { describe, expect, it } from 'vitest';
import { computeEntitlements, effectiveSubscription, canAccessStation, type SubscriptionRow } from '../lib/billing/entitlements';
import { computeMrrIls } from '../lib/billing/service';

const now = new Date('2026-10-11T12:00:00Z');
const row = (p: Partial<SubscriptionRow>): SubscriptionRow => ({ id: 'x', user_id: 'u', tier: 'premium', billing_interval: 'monthly', status: 'active', provider: 'none', trial_ends_at: null, current_period_end: null, cancel_at_period_end: false, ...p });

describe('billing entitlements', () => {
  it('free when nothing live (enforced)', () => {
    const e = computeEntitlements([row({ status: 'expired' })], 'user', { now, enforced: true });
    expect(e.tier).toBe('free');
    expect(canAccessStation(e, 0)).toBe(true);
    expect(canAccessStation(e, 1)).toBe(false);
    expect(e.features).toContain('sos');
  });
  it('trial grants premium until it ends', () => {
    const live = row({ status: 'trialing', trial_ends_at: '2026-10-20T00:00:00Z' });
    expect(computeEntitlements([live], 'user', { now, enforced: true }).source).toBe('trial');
    expect(effectiveSubscription([row({ status: 'trialing', trial_ends_at: '2026-10-01T00:00:00Z' })], now)).toBeNull();
  });
  it('canceled keeps access until period end; highest tier wins', () => {
    const e = computeEntitlements([row({ status: 'canceled', current_period_end: '2026-10-30T00:00:00Z' }), row({ tier: 'pro', current_period_end: '2026-11-01T00:00:00Z' })], 'user', { now, enforced: true });
    expect(e.tier).toBe('pro');
  });
  it('staff (admin/test) always full; not enforced = full features', () => {
    expect(computeEntitlements([], 'test', { now, enforced: true }).source).toBe('staff');
    const e = computeEntitlements([], 'user', { now, enforced: false });
    expect(canAccessStation(e, 5)).toBe(true);
  });
  it('MRR counts active/past_due, annual /12', () => {
    expect(computeMrrIls([{ tier: 'premium', billing_interval: 'monthly', status: 'active' }, { tier: 'pro', billing_interval: 'annual', status: 'active' }, { tier: 'pro', billing_interval: 'monthly', status: 'canceled' }])).toBeCloseTo(49 + 850 / 12, 2);
  });
});
