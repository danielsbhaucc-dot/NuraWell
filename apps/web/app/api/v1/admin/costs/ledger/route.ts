import { NextResponse } from 'next/server';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { consumeMultiRateLimits, rateLimitResponse } from '@/lib/api/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadCostLedger } from '@/lib/admin/cost-ledger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** `GET /api/v1/admin/costs/ledger` — smart monthly cost ledger (receipts + metered usage), admin only. */
export async function GET(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;
  const rl = await consumeMultiRateLimits(auth.user.id, 'admin-api', [
    { limit: 30, windowSeconds: 60 },
    { limit: 300, windowSeconds: 3600 },
  ]);
  if (!rl.ok) return rateLimitResponse(rl);
  try {
    const data = await loadCostLedger(createAdminClient());
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('[admin/costs/ledger]', e instanceof Error ? e.message : 'error');
    return NextResponse.json({ error: 'ledger_failed' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
