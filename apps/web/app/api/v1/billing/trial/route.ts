import { NextResponse } from 'next/server';
import { requireApiSession } from '@/lib/api/route-guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { startTrial } from '@/lib/billing/service';

export const runtime = 'nodejs';

/** Start the one-time free trial for the signed-in user. */
export async function POST(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;
  const r = await startTrial(createAdminClient(), auth.user.id);
  return NextResponse.json(r, { status: r.ok ? 200 : r.reason === 'trial_used' ? 409 : 500 });
}
