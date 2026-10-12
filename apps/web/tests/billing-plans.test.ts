import { describe, expect, it } from 'vitest';
import { PLANS, planPrice, getPlan, isPlanId } from '@/lib/billing/plans';

describe('plans config', () => {
  it('highlighted whatsapp plan is in the middle', () => {
    expect(PLANS.map((p) => p.id)).toEqual(['basic', 'whatsapp', 'premium']);
    expect(PLANS[1].highlighted).toBe(true);
  });
  it('prices', () => {
    expect(planPrice(getPlan('basic'), 'monthly')).toMatchObject({ full: 179, launch: 107 });
    expect(planPrice(getPlan('whatsapp'), 'monthly')).toMatchObject({ full: 199, launch: 119 });
    expect(planPrice(getPlan('premium'), 'annual')).toMatchObject({ full: 4490, launch: null });
  });
  it('defaults to basic', () => {
    expect(getPlan(null).id).toBe('basic');
    expect(isPlanId('nope')).toBe(false);
  });
});
