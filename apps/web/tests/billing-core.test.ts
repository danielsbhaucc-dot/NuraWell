import { describe, it, expect } from 'vitest';
import {
  transition, hasAccess, cyclePriceAgorot, couponApplies, prorationAgorot, vatBreakdown, formatIls,
  resolveEntitlements, can, quota, remainingUsage, quoteCancellation, withinCoolingOff,
  nextRetryAt, dunningExhausted, dunningDedupeKey, verifySignature, signPayload,
  MockPaymentProvider, processWebhook, CardcomProvider, TranzilaProvider, GrowProvider, PayPlusProvider,
  GreenInvoiceProvider, ICountProvider, NotImplementedProviderError, PROVIDER_REQUIREMENTS,
  type EventStore, type Coupon,
} from '@saas/billing';

const memStore = (): EventStore & { keys: Set<string> } => {
  const keys = new Set<string>();
  return { keys, async insertOnce(e) { const k = `${e.productId}|${e.provider}|${e.key}`; if (keys.has(k)) return 'duplicate'; keys.add(k); return 'inserted'; } };
};

describe('state machine', () => {
  it('active -> past_due -> active', () => {
    const a = transition('active', 'payment_failed'); expect(a.ok && a.to).toBe('past_due');
    const b = transition('past_due', 'payment_recovered'); expect(b.ok && b.to).toBe('active');
  });
  it('entering ended sets ended_at; resubscribe clears it', () => {
    const e = transition('canceled', 'period_ended'); expect(e.ok && e.setsEndedAt).toBe(true);
    const r = transition('ended', 'activated'); expect(r.ok && r.clearsEndedAt).toBe(true);
  });
  it('rejects invalid transitions', () => { expect(transition('ended', 'renewed').ok).toBe(false); });
  it('dunning exhausted ends', () => { const t = transition('past_due', 'dunning_exhausted'); expect(t.ok && t.to).toBe('ended'); });
  it('access', () => { expect(hasAccess('active')).toBe(true); expect(hasAccess('ended')).toBe(false); });
});

describe('pricing', () => {
  const coupon: Coupon = { productId: 'nurawell', code: 'LAUNCH40', percentOff: 40, durationCycles: 3 };
  const now = new Date('2026-11-01T00:00:00Z');
  it('launch coupon 40% for first 3 cycles only', () => {
    expect(cyclePriceAgorot({ priceAgorot: 19900 }, coupon, 0, now)).toBe(11940);
    expect(cyclePriceAgorot({ priceAgorot: 19900 }, coupon, 2, now)).toBe(11940);
    expect(cyclePriceAgorot({ priceAgorot: 19900 }, coupon, 3, now)).toBe(19900);
    expect(couponApplies(null, 0, now)).toBe(false);
  });
  it('proration upgrade mid-period is positive, downgrade negative', () => {
    const s = new Date('2026-11-01T00:00:00Z'), e = new Date('2026-12-01T00:00:00Z'), mid = new Date('2026-11-16T00:00:00Z');
    expect(prorationAgorot(17900, 44900, s, e, mid)).toBe(13500);
    expect(prorationAgorot(44900, 17900, s, e, mid)).toBeLessThan(0);
  });
  it('vat breakdown sums', () => {
    const v = vatBreakdown(17900, true, 0.18); expect(v.netAgorot + v.vatAgorot).toBe(v.totalAgorot);
    expect(formatIls(17900)).toContain('179');
  });
});

describe('entitlements', () => {
  const plan = { code: 'phone', features: { whatsapp: true, phone_minutes: 30 } };
  it('active plan grants', () => {
    const e = resolveEntitlements(plan, 'active', {}); expect(can(e, 'whatsapp')).toBe(true); expect(quota(e, 'phone_minutes')).toBe(30);
  });
  it('ended plan grants nothing', () => { expect(can(resolveEntitlements(plan, 'ended', {}), 'whatsapp')).toBe(false); });
  it('metering', () => { expect(remainingUsage(30, 30, 45)).toBe(15); expect(remainingUsage(30, 0, 99)).toBe(0); });
});

describe('consumer law (14-day cancellation)', () => {
  const tx = new Date('2026-11-01T00:00:00Z');
  it('within 14 days: refund minus min(5%,100₪)', () => {
    const q = quoteCancellation({ paidAgorot: 44900, transactionAt: tx, periodEnd: null, now: new Date('2026-11-10T00:00:00Z') });
    expect(q.mode).toBe('cooling_off_refund'); expect(q.feeAgorot).toBe(2245); expect(q.refundAgorot).toBe(42655);
  });
  it('fee capped at 100₪', () => {
    const q = quoteCancellation({ paidAgorot: 1_000_000, transactionAt: tx, periodEnd: null, now: tx }); expect(q.feeAgorot).toBe(10_000);
  });
  it('after 14 days: ends at period end', () => {
    expect(withinCoolingOff(tx, new Date('2026-11-20T00:00:00Z'))).toBe(false);
    const q = quoteCancellation({ paidAgorot: 44900, transactionAt: tx, periodEnd: new Date('2026-12-01T00:00:00Z'), now: new Date('2026-11-20T00:00:00Z') });
    expect(q.mode).toBe('end_of_period'); expect(q.refundAgorot).toBe(0);
  });
});

describe('dunning', () => {
  it('schedule + unique dedupe key', () => {
    const f = new Date('2026-11-01T00:00:00Z');
    expect(nextRetryAt(f, 1, [1, 3, 7])?.toISOString()).toBe('2026-11-02T00:00:00.000Z');
    expect(dunningExhausted(4, [1, 3, 7])).toBe(true); expect(dunningExhausted(3, [1, 3, 7])).toBe(false);
    expect(dunningDedupeKey('s1', 1)).not.toBe(dunningDedupeKey('s1', 2));
  });
});

describe('webhooks', () => {
  const secret = 'test_secret_only';
  const now = Math.floor(Date.now() / 1000);
  it('bad signature rejected', () => {
    expect(verifySignature({ secret, rawBody: '{}', signature: 'deadbeef', timestampSec: now }).ok).toBe(false);
    expect(verifySignature({ secret, rawBody: '{}', signature: null, timestampSec: now }).ok).toBe(false);
  });
  it('stale timestamp rejected (replay window)', () => {
    const t = now - 3600;
    const r = verifySignature({ secret, rawBody: '{}', signature: signPayload(secret, t, '{}'), timestampSec: t });
    expect(r).toEqual({ ok: false, error: 'stale_timestamp' });
  });
  it('tampered body rejected', () => {
    expect(verifySignature({ secret, rawBody: '{"a":2}', signature: signPayload(secret, now, '{"a":1}'), timestampSec: now }).ok).toBe(false);
  });
  it('processWebhook: accept once, duplicate on replay, reject forged', async () => {
    const p = new MockPaymentProvider({ webhookSecret: secret, checkoutBaseUrl: 'https://example.test/co' });
    const store = memStore();
    const signed = p.signEvent({ providerEventId: 'ev1', kind: 'payment_failed', providerRef: 'r1', occurredAt: new Date().toISOString() });
    const a = await processWebhook({ productId: 'nurawell', provider: p, input: signed, store });
    expect(a.status).toBe('accepted'); expect(a.status === 'accepted' && a.billingEvent).toBe('payment_failed');
    expect((await processWebhook({ productId: 'nurawell', provider: p, input: signed, store })).status).toBe('duplicate');
    const forged = { rawBody: signed.rawBody, headers: { ...signed.headers, 'x-billing-signature': '00'.repeat(32) } };
    expect((await processWebhook({ productId: 'nurawell', provider: p, input: forged, store })).status).toBe('rejected');
  });
});

describe('providers', () => {
  it('mock is idempotent and never real', async () => {
    const p = new MockPaymentProvider({ webhookSecret: 'x', checkoutBaseUrl: 'https://example.test/co' });
    const req = { productId: 'nurawell', userId: 'u', planCode: 'basic', amountAgorot: 17900, description: 'd', successUrl: 's', cancelUrl: 'c', recurring: true, idempotencyKey: 'k1' };
    expect((await p.createCheckout(req)).providerRef).toBe((await p.createCheckout(req)).providerRef);
    p.failNextCharge = true; expect((await p.chargeRecurring({ providerRef: 'r', amountAgorot: 1, idempotencyKey: 'c1' })).ok).toBe(false);
  });
  it('real providers are explicit stubs that throw (no fake success)', async () => {
    for (const make of [CardcomProvider, TranzilaProvider, GrowProvider, PayPlusProvider]) {
      const p = make(); expect(p.implemented).toBe(false);
      await expect(p.chargeRecurring({ providerRef: 'r', amountAgorot: 1, idempotencyKey: 'k' })).rejects.toBeInstanceOf(NotImplementedProviderError);
    }
    for (const make of [GreenInvoiceProvider, ICountProvider]) expect(make().implemented).toBe(false);
    expect(PROVIDER_REQUIREMENTS.cardcom.webhook).toContain('/api/v1/billing/webhook/cardcom');
  });
});
