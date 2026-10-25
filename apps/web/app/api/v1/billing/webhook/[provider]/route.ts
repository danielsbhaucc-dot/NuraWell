import { NextResponse } from 'next/server';
import { processWebhook } from '@saas/billing';
import { createAdminClient } from '@/lib/supabase/admin';
import { billingPlatformEnabled, getPaymentProvider, PRODUCT_ID, supabaseEventStore } from '@/lib/billing/platform';
import { applyBillingEvent } from '@/lib/billing/subscription-service';

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
  let outcome = 'ignored';
  if (out.billingEvent) {
    const applied = await applyBillingEvent(admin, {
      event: out.billingEvent, provider: provider.name, providerRef: out.event.providerRef, userId: out.event.userId,
      now: new Date(out.event.occurredAt || Date.now()), source: 'webhook',
    });
    outcome = applied.ok ? `${out.billingEvent}:${applied.from}->${applied.to}` : `${out.billingEvent}:${applied.error}`;
  }
  await admin.from('billing_webhook_events').update({ outcome })
    .eq('product_id', PRODUCT_ID).eq('provider', provider.name).eq('idempotency_key', out.key);
  return NextResponse.json({ ok: true });
}
