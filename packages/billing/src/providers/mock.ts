import { createHash, randomUUID } from 'node:crypto';
import { signPayload, verifySignature } from '../webhooks';
import type { InvoiceProvider, NormalizedEvent, PaymentProvider } from './types';

/**
 * Fully working in-memory provider for dev, e2e and admin testing. Never moves real money.
 * Webhooks are HMAC-signed with the injected secret exactly like a real provider would.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock';
  readonly implemented = true;
  private seen = new Map<string, string>();
  failNextCharge = false;
  constructor(private opts: { webhookSecret: string; checkoutBaseUrl: string }) {}

  private once(key: string, make: () => string): string {
    const v = this.seen.get(key) ?? make();
    this.seen.set(key, v);
    return v;
  }
  async createCheckout(req: Parameters<PaymentProvider['createCheckout']>[0]) {
    const ref = this.once(`co:${req.idempotencyKey}`, () => `mock_sub_${randomUUID()}`);
    return { providerRef: ref, redirectUrl: `${this.opts.checkoutBaseUrl}?ref=${encodeURIComponent(ref)}` };
  }
  async chargeRecurring(p: { providerRef: string; amountAgorot: number; idempotencyKey: string }) {
    if (this.failNextCharge) { this.failNextCharge = false; return { ok: false as const, error: 'card_declined', retryable: true }; }
    return { ok: true as const, providerPaymentId: this.once(`ch:${p.idempotencyKey}`, () => `mock_pay_${randomUUID()}`) };
  }
  async cancel() { return { ok: true }; }
  async refund(p: { providerPaymentId: string; amountAgorot: number; idempotencyKey: string }) {
    return { ok: true, providerRefundId: this.once(`rf:${p.idempotencyKey}`, () => `mock_rf_${randomUUID()}`) };
  }
  /** Test helper: build a signed webhook the same way a provider would. */
  signEvent(ev: NormalizedEvent, timestampSec = Math.floor(Date.now() / 1000)) {
    const rawBody = JSON.stringify(ev);
    return { rawBody, headers: { 'x-billing-signature': signPayload(this.opts.webhookSecret, timestampSec, rawBody), 'x-billing-timestamp': String(timestampSec) } };
  }
  async parseWebhook(input: { rawBody: string; headers: Record<string, string | undefined> }): Promise<NormalizedEvent> {
    const v = verifySignature({ secret: this.opts.webhookSecret, rawBody: input.rawBody, signature: input.headers['x-billing-signature'] ?? null, timestampSec: Number(input.headers['x-billing-timestamp']) || null });
    if (!v.ok) throw new Error(v.error);
    return JSON.parse(input.rawBody) as NormalizedEvent;
  }
}

export class MockInvoiceProvider implements InvoiceProvider {
  readonly name = 'mock-invoice';
  readonly implemented = true;
  private n = 1000;
  async issueInvoiceReceipt(req: { idempotencyKey: string }) {
    const num = `MOCK-${++this.n}`;
    return { number: num, url: `about:blank#${createHash('sha256').update(req.idempotencyKey).digest('hex').slice(0, 12)}` };
  }
  async issueCreditNote() { const num = `MOCK-CN-${++this.n}`; return { number: num, url: 'about:blank' }; }
}
