import type { Coupon, Plan } from './types';

export function couponApplies(c: Coupon | null | undefined, cycleIndex: number, now: Date): boolean {
  if (!c) return false;
  if (c.validFrom && now < new Date(c.validFrom)) return false;
  if (c.validUntil && now > new Date(c.validUntil)) return false;
  if (c.maxRedemptions != null && cycleIndex === 0 && (c.redeemed ?? 0) >= c.maxRedemptions) return false;
  return c.durationCycles == null || cycleIndex < c.durationCycles;
}

/** Price for billing cycle #cycleIndex (0-based) in agorot, rounded to whole agorot. */
export function cyclePriceAgorot(plan: Pick<Plan, 'priceAgorot'>, coupon: Coupon | null, cycleIndex: number, now: Date, addOnsAgorot = 0): number {
  const base = plan.priceAgorot + addOnsAgorot;
  const pct = couponApplies(coupon, cycleIndex, now) ? Math.min(100, Math.max(0, coupon!.percentOff)) : 0;
  return Math.round(base * (1 - pct / 100));
}

/** Split a charged amount into net + VAT. If prices exclude VAT, VAT is added on top. */
export function vatBreakdown(amountAgorot: number, includesVat: boolean, vatRate: number) {
  if (includesVat) {
    const net = Math.round(amountAgorot / (1 + vatRate));
    return { netAgorot: net, vatAgorot: amountAgorot - net, totalAgorot: amountAgorot };
  }
  const vat = Math.round(amountAgorot * vatRate);
  return { netAgorot: amountAgorot, vatAgorot: vat, totalAgorot: amountAgorot + vat };
}

/**
 * Proration on plan change mid-period: credit unused time on the old price, charge remaining time on the new.
 * Positive = charge now (upgrade), negative = credit to next invoice (downgrade). Pure.
 */
export function prorationAgorot(oldPriceAgorot: number, newPriceAgorot: number, periodStart: Date, periodEnd: Date, now: Date): number {
  const total = periodEnd.getTime() - periodStart.getTime();
  if (total <= 0) return 0;
  const left = Math.min(Math.max(periodEnd.getTime() - now.getTime(), 0), total);
  const frac = left / total;
  return Math.round(newPriceAgorot * frac - oldPriceAgorot * frac);
}

export function formatIls(agorot: number): string {
  return `${(agorot / 100).toLocaleString('he-IL', { minimumFractionDigits: agorot % 100 ? 2 : 0, maximumFractionDigits: 2 })} ₪`;
}
