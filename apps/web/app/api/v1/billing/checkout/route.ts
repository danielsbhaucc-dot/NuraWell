import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readJsonBody } from '@/lib/api/json-request';
import { requireApiSession } from '@/lib/api/route-guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { getBillingProvider, ProviderNotConfiguredError } from '@/lib/billing/provider';

export const runtime = 'nodejs';

const schema = z.object({ tier: z.enum(['premium', 'pro']), interval: z.enum(['monthly', 'annual']) });

export async function POST(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;
  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;
  const p = schema.safeParse(raw.value);
  if (!p.success) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  const provider = getBillingProvider();
  const origin = new URL(request.url).origin;
  try {
    const { url } = await provider.createCheckout({ userId: auth.user.id, email: auth.user.email ?? null, ...p.data, successUrl: `${origin}/upgrade?status=success`, cancelUrl: `${origin}/upgrade?status=cancel` });
    await createAdminClient().from('billing_events').insert({ user_id: auth.user.id, kind: 'checkout_started', provider: provider.id, metadata: p.data });
    return NextResponse.json({ url });
  } catch (e) {
    if (e instanceof ProviderNotConfiguredError) return NextResponse.json({ error: 'provider_not_configured' }, { status: 501 });
    return NextResponse.json({ error: 'checkout_failed' }, { status: 502 });
  }
}
