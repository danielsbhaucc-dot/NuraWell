import { NextResponse } from 'next/server';
import { authorizeCronRequest } from '@/lib/api/authorize-cron';
import { createAdminClient } from '@/lib/supabase/admin';
import { runLogRetentionJob } from '@/lib/logs/retention-job';
import { runSubscriptionRetention } from '@/lib/privacy/subscription-retention';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Daily log retention: batched purge of operational (30–90d) and access (730d) logs, legal/consent rows
 * are only counted. Idempotent (advisory lock in SQL); each run is recorded in log_retention_runs.
 * Also checks DB size against the free plan and alerts the owner. Returns counts only.
 */
export async function POST(request: Request) {
  const denied = await authorizeCronRequest(request);
  if (denied) return denied;
  try {
    const dryRun = new URL(request.url).searchParams.get('dry') === '1';
    const admin = createAdminClient();
    const out = await runLogRetentionJob(admin, { dryRun });
    // Personal data after the subscription ended (user's own choice). Counts only.
    let subscription_retention: unknown = null;
    try {
      subscription_retention = await runSubscriptionRetention(admin, { dryRun });
    } catch (e) {
      subscription_retention = { error: e instanceof Error ? e.message.slice(0, 120) : 'error' };
    }
    console.log('[cron/log-retention]', JSON.stringify({ deleted: out.deleted, db_bytes: out.db_bytes, alert: out.alert, subscription_retention }));
    return NextResponse.json({ ok: true, ...out, subscription_retention });
  } catch (e) {
    console.error('[cron/log-retention] failed', e instanceof Error ? e.message : 'error');
    return NextResponse.json({ ok: false, error: 'retention_failed' }, { status: 500 });
  }
}

export const GET = POST;
