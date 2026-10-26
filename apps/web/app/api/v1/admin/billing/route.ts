import { NextResponse } from 'next/server';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { createAdminClient } from '@/lib/supabase/admin';
import { PRODUCT_ID, billingPlatformEnabled } from '@/lib/billing/platform';
import { loadPlansLite, mrrAgorot, statusCounts } from '@/lib/billing/screens';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Ops billing overview: counts, MRR, past-due and failed payments. No card data, no names. Flag-gated. */
export async function GET(request: Request) {
  if (!billingPlatformEnabled()) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;
  const admin = createAdminClient();
  try {
    const [plans, subsQ, failedQ] = await Promise.all([
      loadPlansLite(admin),
      admin.from('subscriptions').select('id, user_id, status, plan_code, current_period_end, ended_at, dunning_attempt, next_retry_at, provider').eq('product_id', PRODUCT_ID).order('created_at', { ascending: false }).limit(500),
      admin.from('billing_payments').select('id, subscription_id, amount_agorot, failure_code, created_at').eq('product_id', PRODUCT_ID).eq('status', 'failed').order('created_at', { ascending: false }).limit(50),
    ]);
    const subs = subsQ.data ?? [];
    return NextResponse.json({
      counts: statusCounts(subs),
      mrr_agorot: mrrAgorot(subs, plans),
      subscriptions: subs.slice(0, 100),
      past_due: subs.filter((s) => s.status === 'past_due'),
      failed_payments: failedQ.data ?? [],
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'load_failed' }, { status: 500 });
  }
}
