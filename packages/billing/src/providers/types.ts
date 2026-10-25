export type CheckoutRequest = { productId: string; userId: string; planCode: string; amountAgorot: number; description: string; successUrl: string; cancelUrl: string; recurring: boolean; idempotencyKey: string };
/** Hosted payment page only: we never see or store card data (minimal PCI scope, SAQ-A). */
export type CheckoutSession = { providerRef: string; redirectUrl: string };
export type ChargeResult = { ok: true; providerPaymentId: string } | { ok: false; error: string; retryable: boolean };
export type NormalizedEvent = {
  providerEventId: string;
  kind: 'payment_succeeded' | 'payment_failed' | 'subscription_canceled' | 'refund_succeeded';
  providerRef: string; // subscription / token reference at the provider
  userId?: string;
  amountAgorot?: number;
  occurredAt: string;
};
export type WebhookInput = { rawBody: string; headers: Record<string, string | undefined> };

export interface PaymentProvider {
  readonly name: string;
  readonly implemented: boolean;
  createCheckout(req: CheckoutRequest): Promise<CheckoutSession>;
  chargeRecurring(p: { providerRef: string; amountAgorot: number; idempotencyKey: string }): Promise<ChargeResult>;
  cancel(p: { providerRef: string }): Promise<{ ok: boolean }>;
  refund(p: { providerPaymentId: string; amountAgorot: number; idempotencyKey: string }): Promise<{ ok: boolean; providerRefundId?: string }>;
  /** Verify signature + timestamp and parse. Throws on bad signature. */
  parseWebhook(input: WebhookInput): Promise<NormalizedEvent>;
}

export type InvoiceRequest = { productId: string; customerName: string; customerEmail: string; lines: { description: string; amountAgorot: number }[]; vatIncluded: boolean; paymentRef: string; idempotencyKey: string };
export interface InvoiceProvider {
  readonly name: string;
  readonly implemented: boolean;
  /** Tax invoice-receipt (חשבונית מס/קבלה). */
  issueInvoiceReceipt(req: InvoiceRequest): Promise<{ number: string; url: string }>;
  issueCreditNote(p: { originalNumber: string; amountAgorot: number; idempotencyKey: string }): Promise<{ number: string; url: string }>;
}

export class NotImplementedProviderError extends Error {
  constructor(provider: string, what: string) {
    super(`${provider}: ${what} is not implemented yet (see docs/billing/PROVIDER_INTEGRATION.he.md)`);
    this.name = 'NotImplementedProviderError';
  }
}
