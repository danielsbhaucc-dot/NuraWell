/**
 * Israeli Consumer Protection Law (חוק הגנת הצרכן, סעיפים 14ג, 14ג1, 13ד; תקנות ביטול עסקה 2010).
 * Distance transaction: the consumer may cancel within 14 days from the transaction (or from receiving
 * the disclosure document, whichever is later). Cancellation fee: up to 5% of the price or 100 ₪, the lower.
 * Ongoing transaction (עסקה מתמשכת): cancellation any time, through the same channel it was made
 * (online -> online), effective within 3 business days; written confirmation must be sent.
 * NOTE: not legal advice; to be confirmed by a lawyer before launch.
 */
export const COOLING_OFF_DAYS = 14;
export const MAX_FEE_RATE = 0.05;
export const MAX_FEE_AGOROT = 10_000;

export function withinCoolingOff(transactionAt: Date, now: Date, disclosureAt?: Date | null): boolean {
  const start = disclosureAt && disclosureAt > transactionAt ? disclosureAt : transactionAt;
  return now.getTime() - start.getTime() <= COOLING_OFF_DAYS * 86_400_000;
}

export type CancellationQuote = { mode: 'cooling_off_refund' | 'end_of_period'; refundAgorot: number; feeAgorot: number; effectiveAt: string };

/**
 * Within cooling-off: refund what was paid minus the capped fee, access ends now.
 * Otherwise: no charge going forward, access continues to the end of the paid period.
 * chargeFee=false lets a product waive the fee (recommended for goodwill).
 */
export function quoteCancellation(p: { paidAgorot: number; transactionAt: Date; periodEnd: Date | null; now: Date; disclosureAt?: Date | null; chargeFee?: boolean }): CancellationQuote {
  if (withinCoolingOff(p.transactionAt, p.now, p.disclosureAt)) {
    const fee = p.chargeFee === false ? 0 : Math.min(Math.round(p.paidAgorot * MAX_FEE_RATE), MAX_FEE_AGOROT);
    return { mode: 'cooling_off_refund', refundAgorot: Math.max(0, p.paidAgorot - fee), feeAgorot: fee, effectiveAt: p.now.toISOString() };
  }
  return { mode: 'end_of_period', refundAgorot: 0, feeAgorot: 0, effectiveAt: (p.periodEnd ?? p.now).toISOString() };
}
