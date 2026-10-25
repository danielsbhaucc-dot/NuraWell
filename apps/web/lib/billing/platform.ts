/**
 * Thin NuraWell wiring over the product-agnostic @saas/billing package.
 * Everything here is gated by BILLING_PLATFORM_ENABLED (unset/false in prod => fully dark).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  MockPaymentProvider, CardcomProvider, TranzilaProvider, GrowProvider, PayPlusProvider,
  type EventStore, type PaymentProvider, type Plan,
} from '@saas/billing';

export const PRODUCT_ID = 'nurawell';

export function billingPlatformEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.BILLING_PLATFORM_ENABLED === 'true';
}

/** Mock is refused in production deployments unless explicitly allowed (never real money either way). */
export function getPaymentProvider(name: string, env: Record<string, string | undefined> = process.env): PaymentProvider | null {
  switch (name) {
    case 'mock': {
      if (env.VERCEL_ENV === 'production' && env.BILLING_ALLOW_MOCK !== 'true') return null;
      const secret = env.BILLING_WEBHOOK_SECRET;
      if (!secret) return null;
      return new MockPaymentProvider({ webhookSecret: secret, checkoutBaseUrl: '/billing/mock-checkout' });
    }
    case 'cardcom': return CardcomProvider();
    case 'tranzila': return TranzilaProvider();
    case 'grow': return GrowProvider();
    case 'payplus': return PayPlusProvider();
    default: return null;
  }
}

export function supabaseEventStore(admin: SupabaseClient): EventStore {
  return {
    async insertOnce(e) {
      const { error } = await admin.from('billing_webhook_events').insert({
        product_id: e.productId, provider: e.provider, idempotency_key: e.key, kind: e.kind, payload_sha256: e.payloadHash,
      });
      if (!error) return 'inserted';
      if (error.code === '23505') return 'duplicate';
      throw new Error('event_store_failed');
    },
  };
}

type PlanRow = { product_id: string; code: string; name_he: string; price_agorot: number; billing_interval: 'monthly' | 'annual'; prices_include_vat: boolean; badge_he: string | null; features: Record<string, boolean | number>; sort: number };

export async function loadPlans(admin: SupabaseClient, productId = PRODUCT_ID): Promise<Plan[]> {
  const { data, error } = await admin.from('billing_plans').select('*').eq('product_id', productId).eq('active', true).order('sort');
  if (error) throw new Error('plans_load_failed');
  return ((data ?? []) as PlanRow[]).map((r) => ({
    productId: r.product_id, code: r.code, nameHe: r.name_he, priceAgorot: r.price_agorot, interval: r.billing_interval,
    pricesIncludeVat: r.prices_include_vat, badgeHe: r.badge_he, features: r.features, sort: r.sort,
  })) as unknown as Plan[];
}
