import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getBillingProvider, ProviderNotConfiguredError } from '@/lib/billing/provider';
import { applyBillingEvents } from '@/lib/billing/service';

export const runtime = 'nodejs';

/** Provider webhook. Signature verification is the adapter's job (parseWebhook throws on invalid). */
export async function POST(request: Request) {
  const provider = getBillingProvider();
  const raw = await request.text();
  try {
    const events = await provider.parseWebhook(raw, request.headers);
    await applyBillingEvents(createAdminClient(), provider.id, events);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ProviderNotConfiguredError) return NextResponse.json({ error: 'provider_not_configured' }, { status: 501 });
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }
}
