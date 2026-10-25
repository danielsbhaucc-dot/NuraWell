import { NextResponse } from 'next/server';
import { authorizeCronRequest } from '@/lib/api/authorize-cron';
import { createAdminClient } from '@/lib/supabase/admin';
import { runLogRetentionJob } from '@/lib/logs/retention-job';

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
    const out = await runLogRetentionJob(createAdminClient(), { dryRun });
    console.log('[cron/log-retention]', JSON.stringify({ deleted: out.deleted, db_bytes: out.db_bytes, alert: out.alert }));
    return NextResponse.json({ ok: true, ...out });
  } catch (e) {
    console.error('[cron/log-retention] failed', e instanceof Error ? e.message : 'error');
    return NextResponse.json({ ok: false, error: 'retention_failed' }, { status: 500 });
  }
}

export const GET = POST;
