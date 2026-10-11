import { NextResponse } from 'next/server';
import { requireApiSession } from '@/lib/api/route-guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEntitlements } from '@/lib/billing/entitlements';
import { getBillingProvider } from '@/lib/billing/provider';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;
  const e = await getEntitlements(createAdminClient(), auth.user.id);
  return NextResponse.json({ ...e, providerConfigured: getBillingProvider().configured }, { headers: { 'Cache-Control': 'private, no-store' } });
}
