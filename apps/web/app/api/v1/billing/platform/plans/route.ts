import { NextResponse } from 'next/server';
import { requireApiSession } from '@/lib/api/route-guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { billingPlatformEnabled } from '@/lib/billing/platform';
import { loadPlansLite } from '@/lib/billing/screens';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!billingPlatformEnabled()) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json({ plans: await loadPlansLite(createAdminClient()) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'plans_failed' }, { status: 500 });
  }
}
