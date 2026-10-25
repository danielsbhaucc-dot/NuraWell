import { NextResponse } from 'next/server';
import { runChecks } from '@platform/qc';
import { requireApiAdmin } from '@/lib/api/route-guards';
import { consumeMultiRateLimits, rateLimitResponse } from '@/lib/api/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';
import { selectedProduct } from '@/lib/platform/authorize';
import { qcChecksFor } from '@/lib/platform/qc-checks';

export const dynamic = 'force-dynamic';
const WINDOWS: Record<string, number> = { '24h': 86_400_000, '7d': 7 * 86_400_000 };

/** QC report for the selected product. Guarded: admin + qc.read on that product + qc module enabled. */
export async function GET(request: Request) {
  const g = await requireApiAdmin(request);
  if (!g.ok) return g.response;
  const rl = await consumeMultiRateLimits(g.user.id, 'ops-qc', [{ limit: 30, windowSeconds: 60 }]);
  if (!rl.ok) return rateLimitResponse(rl);
  const product = selectedProduct(request);
  const w = new URL(request.url).searchParams.get('window') ?? '24h';
  const now = Date.now();
  const report = await runChecks(qcChecksFor(createAdminClient(), product), { productId: product, sinceMs: now - (WINDOWS[w] ?? WINDOWS['24h']), now });
  return NextResponse.json({ ...report, window: WINDOWS[w] ? w : '24h' }, { headers: { 'Cache-Control': 'no-store' } });
}
