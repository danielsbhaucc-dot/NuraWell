export type ProductId = string;
export type Money = { amountAgorot: number; currency: 'ILS' };
export type BillingInterval = 'monthly' | 'annual';
export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'ended';

export type Plan = {
  productId: ProductId;
  code: string;
  nameHe: string;
  priceAgorot: number;
  interval: BillingInterval;
  /** TODO(product owner): undecided whether listed prices include VAT. */
  pricesIncludeVat: boolean;
  badgeHe?: string | null;
  features: Record<string, boolean | number>;
  active: boolean;
  sort: number;
};

export type AddOn = { productId: ProductId; code: string; nameHe: string; priceAgorot: number; unit: string; quantity: number };

export type Coupon = {
  productId: ProductId;
  code: string;
  percentOff: number; // 0-100
  durationCycles: number | null; // null = forever
  validFrom?: string | null;
  validUntil?: string | null;
  maxRedemptions?: number | null;
  redeemed?: number;
};

export type Subscription = {
  id: string;
  productId: ProductId;
  userId: string;
  planCode: string;
  status: SubscriptionStatus;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  endedAt: string | null;
  couponCode: string | null;
  couponCyclesUsed: number;
  createdAt: string;
};

export type BillingConfig = {
  productId: ProductId;
  vatRate: number; // e.g. 0.18
  trialDays: number;
  dunningRetryDays: number[]; // after first failure
  graceDays: number; // past_due -> ended after this
};
