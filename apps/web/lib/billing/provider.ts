import type { BillingInterval, Tier } from './tiers';

/**
 * Provider-agnostic billing adapter. Plug a real provider (Stripe / Paddle / Lemon Squeezy / Israeli
 * processors like Cardcom, Tranzila, Grow) by implementing this interface and registering it in getBillingProvider().
 */
export type CheckoutRequest = { userId: string; email: string | null; tier: Exclude<Tier, 'free'>; interval: BillingInterval; successUrl: string; cancelUrl: string };
export type NormalizedBillingEvent = {
  providerEventId: string;
  kind: 'activated' | 'renewed' | 'canceled' | 'expired' | 'payment_failed';
  providerRef: string; // provider subscription id
  userId?: string;
  tier?: Exclude<Tier, 'free'>;
  interval?: BillingInterval;
  currentPeriodEnd?: string;
  amountIls?: number;
};

export interface BillingProvider {
  readonly id: string;
  readonly configured: boolean;
  createCheckout(req: CheckoutRequest): Promise<{ url: string }>;
  cancelAtPeriodEnd(providerRef: string): Promise<void>;
  /** Verify signature and normalize. Must throw on invalid signature. */
  parseWebhook(rawBody: string, headers: Headers): Promise<NormalizedBillingEvent[]>;
}

export class ProviderNotConfiguredError extends Error {
  constructor() {
    super('billing_provider_not_configured');
  }
}

/** Default: no provider yet. Every money-moving call fails closed. */
export const noneProvider: BillingProvider = {
  id: 'none',
  configured: false,
  async createCheckout() {
    throw new ProviderNotConfiguredError();
  },
  async cancelAtPeriodEnd() {
    /* nothing to cancel at a provider; local state is updated by the caller */
  },
  async parseWebhook() {
    throw new ProviderNotConfiguredError();
  },
};

export function getBillingProvider(): BillingProvider {
  // switch (process.env.BILLING_PROVIDER) { case 'stripe': return stripeProvider; ... }
  return noneProvider;
}
