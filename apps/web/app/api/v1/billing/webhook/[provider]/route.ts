import { NextResponse } from 'next/server';
import { processWebhook } from '@saas/billing';
import { createAdminClient } from '@/lib/supabase/admin';
import { billingPlatformEnabled, getPaymentProvider, PRODUCT_ID, supabaseEventStore } from '@/lib/billing/platform';

export const runtime = 'nodejs';

/** Provider webhook: signature + timestamp verified, idempotent via append-only billing_webhook_events. Dark unless flag on. */
export async function POST(request: Request, ctx: { params: Promise<{ provider: string }> }) {
  if (!billingPlatformEnabled()) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const { provider: name } = await ctx.params;
  const provider = getPaymentProvider(name);
  if (!provider || !provider.implemented) return NextResponse.json({ error: 'provider_unavailable' }, { status: 404 });
  const rawBody = await request.text();
  if (rawBody.length > 256_000) return NextResponse.json({ error: 'too_large' }, { status: 413 });
  const headers: Record<string, string> = {};
  request.headers.forEach((v, k) => { headers[k] = v; });
  const admin = createAdminClient();
  const out = await processWebhook({ productId: PRODUCT_ID, provider, input: { rawBody, headers }, store: supabaseEventStore(admin) });
  if (out.status === 'rejected') return NextResponse.json({ error: 'invalid_signature' }, { status: 401 });
  if (out.status === 'duplicate') return NextResponse.json({ ok: true, duplicate: true });
  // Applying the state transition to subscriptions is done by the subscription service (next PR); outcome recorded here.
  await admin.from('billing_webhook_events').update({ outcome: out.billingEvent ?? 'ignored' })
    .eq('product_id', PRODUCT_ID).eq('provider', provider.name).eq('idempotency_key', out.key);
  return NextResponse.json({ ok: true });
}
