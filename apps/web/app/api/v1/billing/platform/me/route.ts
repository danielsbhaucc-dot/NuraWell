import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readJsonBody } from '@/lib/api/json-request';
import { requireApiSession } from '@/lib/api/route-guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { billingPlatformEnabled } from '@/lib/billing/platform';
import { loadMySubscription } from '@/lib/billing/screens';
import { applyBillingEvent } from '@/lib/billing/subscription-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!billingPlatformEnabled()) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json(await loadMySubscription(createAdminClient(), auth.user.id), { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'load_failed' }, { status: 500 });
  }
}

const schema = z.object({ action: z.enum(['cancel', 'undo_cancel']) });

/** Cancel at period end (or undo). Cooling-off refunds go through support until a provider is connected. */
export async function POST(request: Request) {
  if (!billingPlatformEnabled()) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;
  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;
  const p = schema.safeParse(raw.value);
  if (!p.success) return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 });
  const res = await applyBillingEvent(createAdminClient(), { userId: auth.user.id, event: p.data.action === 'cancel' ? 'cancel_requested' : 'cancel_reverted', source: 'user' });
  if (!res.ok) return NextResponse.json({ error: res.error === 'no_subscription' ? 'אין מנוי פעיל' : 'לא ניתן לבצע עכשיו' }, { status: res.error === 'no_subscription' ? 404 : 409 });
  return NextResponse.json({ ok: true, status: res.to });
}
