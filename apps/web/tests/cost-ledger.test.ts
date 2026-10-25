import { describe, expect, it } from 'vitest';
import { buildLedger, buildMonth, costSpikes, linearNext, median, missingReceipts, quantile, receiptMonthShares, type LedgerReceipt, type MonthUsage } from '@/lib/admin/cost-ledger-core';
import { parseBoiCsv, vatIncluded } from '@/lib/admin/fx-core';
import { detectVendor, parseInvoiceRef, parseVat } from '@/lib/legal/media/receipts-core';

const rc = (p: Partial<LedgerReceipt>): LedgerReceipt => ({ id: Math.random().toString(36), vendor: 'google', plan: null, amount: null, currency: 'ILS', amount_ils: null, vat_ils: null, receipt_date: null, period_start: null, period_end: null, trust: 'verified', source: 'email', files: 1, ...p });
const usage = (month: string, p: Partial<MonthUsage> = {}): MonthUsage => ({ month, perUserUsd: {}, sharedUsd: 0, activeUserIds: [], payingUsers: 0, usdIls: 3.5, ...p });
const NOW = new Date('2026-10-25T10:00:00Z');

describe('stats', () => {
  it('median / quantile', () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(quantile([1, 2, 3, 4, 5], 0.9)).toBeCloseTo(4.6);
    expect(median([])).toBe(0);
  });
  it('linear projection', () => {
    expect(linearNext([10, 20, 30])).toBe(40);
    expect(linearNext([30, 20, 10])).toBe(0);
  });
});

describe('vendor detection + parsing', () => {
  it('infra vendors by sender domain, keeps Google consumer receipts', () => {
    expect(detectVendor('receipts@openrouter.ai', 'Your receipt from OpenRouter', '')).toBe('openrouter');
    expect(detectVendor('noreply@notify.cloudflare.com', 'Your invoice is available', '')).toBe('cloudflare');
    expect(detectVendor('payments-noreply@google.com', 'Google Cloud Platform & APIs: קיבלנו את התשלום שלך', '')).toBe('google_cloud');
    expect(detectVendor('payments-noreply@google.com', 'Google One', 'Google AI Pro')).toBe('google');
  });
  it('invoice ref dedupe key + VAT', () => {
    expect(parseInvoiceRef('openrouter', 'Your receipt from OpenRouter, Inc #1641-8558', 'Receipt [#1641-8558]')).toBe('openrouter:1641-8558');
    expect(parseInvoiceRef('cloudflare', 'Invoice IN-81376268', '')).toBe('cloudflare:IN-81376268');
    expect(parseInvoiceRef('google', 'hello', 'nothing here')).toBeNull();
    expect(parseVat('Subtotal $10.00\nVAT $1.80\nTotal $11.80')).toBe(1.8);
    expect(vatIncluded(118)).toBe(18);
  });
  it('Bank of Israel CSV → latest rate on/before the day', () => {
    const csv = 'SERIES_CODE,TIME_PERIOD,OBS_VALUE\nRER_USD_ILS,2026-08-21,3.01\nRER_USD_ILS,2026-08-25,2.986\nRER_USD_ILS,2026-08-26,2.99';
    expect(parseBoiCsv(csv, '2026-08-25')).toBe(2.986);
    expect(parseBoiCsv(csv, '2026-08-23')).toBe(3.01);
    expect(parseBoiCsv('x', '2026-08-23')).toBeNull();
  });
});

describe('month ledger', () => {
  it('prepaid top-ups are cash-out only; metered usage is the cost (no double count)', () => {
    const m = buildMonth('2026-09', [rc({ vendor: 'openrouter', amount: 10.8, currency: 'USD', amount_ils: 36, receipt_date: '2026-09-06' })], usage('2026-09', { perUserUsd: { a: 2 }, sharedUsd: 2, activeUserIds: ['a'] }), NOW);
    const or = m.byVendor.find((v) => v.vendor === 'openrouter')!;
    expect(or.ils).toBe(14); // 4 USD × 3.5
    expect(or.cashOutIls).toBe(36);
    expect(m.totalIls).toBe(14);
  });
  it('invoice beats live estimate; annual plan spread over 12 months', () => {
    const annual = rc({ vendor: 'suno', amount: 120, receipt_date: '2026-01-10', period_start: '2026-01-10', period_end: '2027-01-10' });
    expect(receiptMonthShares(annual)).toHaveLength(12);
    const m = buildMonth('2026-09', [annual, rc({ vendor: 'google_cloud', amount: 60, receipt_date: '2026-09-28' })], usage('2026-09'), NOW);
    expect(m.byVendor.find((v) => v.vendor === 'suno')!.ils).toBe(10);
    const gc = m.byVendor.find((v) => v.vendor === 'google_cloud')!;
    expect(gc.source).toBe('invoice');
    expect(gc.ils).toBe(60);
  });
  it('per-user: usage-weighted variable + equal fixed share; marginal = median variable', () => {
    const m = buildMonth('2026-09', [rc({ vendor: 'google', amount: 30, receipt_date: '2026-09-01' })], usage('2026-09', { perUserUsd: { a: 1, b: 3 }, activeUserIds: ['a', 'b', 'c'], payingUsers: 1, usdIls: 1 }), NOW);
    // variable 4 (all direct), fixed 30 → per user 10 each + direct
    expect(m.totalIls).toBe(34);
    expect(m.activeUsers).toBe(3);
    expect(m.perActiveMeanIls).toBeCloseTo(11.33, 2);
    expect(m.perActiveMedianIls).toBe(11);
    expect(m.marginalIls).toBe(1);
    expect(m.perPayingIls).toBe(34);
  });
  it('rejected receipts and Gmail confirmations are ignored', () => {
    const m = buildMonth('2026-09', [rc({ amount: 50, receipt_date: '2026-09-02', trust: 'rejected' }), rc({ amount: 50, receipt_date: '2026-09-02', source: 'gmail_confirmation' })], usage('2026-09'), NOW);
    expect(m.totalIls).toBe(0);
  });
});

describe('flags + projection', () => {
  const hist = [rc({ amount: 74.9, receipt_date: '2026-07-12' }), rc({ amount: 74.9, receipt_date: '2026-08-12' }), rc({ amount: 74.9, receipt_date: '2026-09-12' })];
  it('flags a missing monthly receipt after its usual day + grace', () => {
    const f = missingReceipts(hist, ['2026-07', '2026-08', '2026-09', '2026-10'], NOW);
    expect(f.map((x) => x.vendor)).toEqual(['google']);
    expect(missingReceipts(hist, ['2026-07', '2026-08', '2026-09', '2026-10'], new Date('2026-10-13T00:00:00Z'))).toEqual([]);
  });
  it('projects missing recurring charges and flags spikes', () => {
    const rep = buildLedger(hist, [usage('2026-10', { perUserUsd: { a: 1 }, activeUserIds: ['a'], usdIls: 1 })], NOW);
    expect(rep.projectedCurrentIls).toBeCloseTo(74.9 + 31 / 25, 2);
    const spikes = costSpikes([buildMonth('2026-08', [rc({ amount: 20, receipt_date: '2026-08-02' })], undefined, NOW), buildMonth('2026-09', [rc({ amount: 80, receipt_date: '2026-09-02' })], undefined, NOW)], null);
    expect(spikes.some((s) => s.vendor === 'google')).toBe(true);
  });
});
