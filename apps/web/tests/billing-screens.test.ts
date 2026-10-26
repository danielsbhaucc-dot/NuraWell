import { describe, it, expect } from 'vitest';
import { mrrAgorot, statusCounts } from '@/lib/billing/screens';

const plans = [
  { code: 'm', nameHe: 'חודשי', priceAgorot: 9900, interval: 'monthly' as const },
  { code: 'y', nameHe: 'שנתי', priceAgorot: 120000, interval: 'annual' as const },
];

describe('billing screens helpers', () => {
  it('MRR counts active and past_due, annual / 12, ignores ended and unknown plans', () => {
    expect(mrrAgorot([
      { status: 'active', plan_code: 'm' }, { status: 'past_due', plan_code: 'y' },
      { status: 'ended', plan_code: 'm' }, { status: 'expired', plan_code: 'm' }, { status: 'active', plan_code: 'zzz' },
    ], plans)).toBe(9900 + 10000);
  });
  it('status counts fold legacy expired into ended', () => {
    expect(statusCounts([{ status: 'expired' }, { status: 'ended' }, { status: 'active' }])).toMatchObject({ ended: 2, active: 1 });
  });
});
