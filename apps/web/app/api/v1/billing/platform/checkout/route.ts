import { NextResponse } from 'next/server';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { readJsonBody } from '@/lib/api/json-request';
import { requireApiSession } from '@/lib/api/route-guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { PRODUCT_ID, billingPlatformEnabled, getPaymentProvider } from '@/lib/billing/platform';
import { loadCoupon, loadPlansLite, quoteFirstCycle } from '@/lib/billing/screens';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({ plan_code: z.string().min(1).max(40), coupon_code: z.string().max(40).optional(), quote_only: z.boolean().optional() });

/** Hosted checkout only (no card data here). Dark unless BILLING_PLATFORM_ENABLED=true. */
export async function POST(request: Request) {
  if (!billingPlatformEnabled()) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;
  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;
  const p = schema.safeParse(raw.value);
  if (!p.success) return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 });
  const admin = createAdminClient();
  const plan = (await loadPlansLite(admin)).find((x) => x.code === p.data.plan_code);
  if (!plan) return NextResponse.json({ error: 'המסלול לא נמצא' }, { status: 404 });
  const coupon = p.data.coupon_code ? await loadCoupon(admin, p.data.coupon_code) : null;
  if (p.data.coupon_code && !coupon) return NextResponse.json({ error: 'הקופון לא בתוקף' }, { status: 422 });
  const quote = quoteFirstCycle(plan, coupon);
  if (p.data.quote_only) return NextResponse.json({ quote });
  const provider = getPaymentProvider(process.env.BILLING_PROVIDER ?? 'mock');
  if (!provider || !provider.implemented) return NextResponse.json({ error: 'provider_not_configured' }, { status: 501 });
  try {
    const origin = new URL(request.url).origin;
    const session = await provider.createCheckout({
      productId: PRODUCT_ID, userId: auth.user.id, planCode: plan.code, amountAgorot: quote.amountAgorot, description: plan.nameHe,
      successUrl: `${origin}/settings/subscription?status=success`, cancelUrl: `${origin}/billing/checkout?status=cancel`, recurring: true, idempotencyKey: randomUUID(),
    });
    await admin.from('billing_events').insert({ user_id: auth.user.id, kind: 'checkout_started', provider: provider.name, product_id: PRODUCT_ID, metadata: { plan_code: plan.code, coupon: !!coupon, provider_ref: session.providerRef } });
    return NextResponse.json({ url: session.redirectUrl, quote });
  } catch {
    return NextResponse.json({ error: 'checkout_failed' }, { status: 502 });
  }
}
