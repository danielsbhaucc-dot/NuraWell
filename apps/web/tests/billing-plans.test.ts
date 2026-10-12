import { describe, expect, it } from 'vitest';
import {
  PLANS,
  planPrice,
  getPlan,
  isPlanId,
  annualSavePercent,
  maxAnnualSavePercent,
} from '@/lib/billing/plans';

describe('plans config', () => {
  it('highlighted whatsapp plan is in the middle', () => {
    expect(PLANS.map((p) => p.id)).toEqual(['basic', 'whatsapp', 'premium']);
    expect(PLANS[1].highlighted).toBe(true);
  });

  it('has no valueIls anchor on any plan', () => {
    for (const p of PLANS) {
      expect('valueIls' in p).toBe(false);
    }
  });

  it('monthly prices with launch discount', () => {
    expect(planPrice(getPlan('basic'), 'monthly')).toMatchObject({ full: 179, launch: 107, savePercent: null });
    expect(planPrice(getPlan('whatsapp'), 'monthly')).toMatchObject({ full: 199, launch: 119, savePercent: null });
    expect(planPrice(getPlan('premium'), 'monthly')).toMatchObject({ full: 449, launch: 269, savePercent: null });
  });

  it('annual is fixed prepaid (not 10× monthly)', () => {
    expect(planPrice(getPlan('basic'), 'annual')).toMatchObject({
      full: 1490,
      launch: null,
      per: 'year',
      monthlyEquivalent: Math.round(1490 / 12),
      monthlyYearTotal: 179 * 12,
      savePercent: annualSavePercent(getPlan('basic')),
    });
    expect(planPrice(getPlan('whatsapp'), 'annual')).toMatchObject({
      full: 1690,
      launch: null,
      monthlyYearTotal: 199 * 12,
    });
    expect(planPrice(getPlan('premium'), 'annual')).toMatchObject({
      full: 3790,
      launch: null,
      monthlyYearTotal: 449 * 12,
    });
  });

  it('annual save percent vs 12× monthly', () => {
    // basic: (2148 - 1490) / 2148 ≈ 30.63% → 31
    expect(annualSavePercent(getPlan('basic'))).toBe(31);
    // whatsapp: (2388 - 1690) / 2388 ≈ 29.23% → 29
    expect(annualSavePercent(getPlan('whatsapp'))).toBe(29);
    // premium: (5388 - 3790) / 5388 ≈ 29.66% → 30
    expect(annualSavePercent(getPlan('premium'))).toBe(30);
    expect(maxAnnualSavePercent()).toBe(31);
  });

  it('defaults to basic', () => {
    expect(getPlan(null).id).toBe('basic');
    expect(isPlanId('nope')).toBe(false);
  });
});
