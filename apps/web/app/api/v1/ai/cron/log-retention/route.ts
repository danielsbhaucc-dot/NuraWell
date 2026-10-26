import { NextResponse } from 'next/server';
import { authorizeCronRequest } from '@/lib/api/authorize-cron';
import { createAdminClient } from '@/lib/supabase/admin';
import { runLogRetentionJob } from '@/lib/logs/retention-job';
import { runSubscriptionRetention } from '@/lib/privacy/subscription-retention';
import { runDunning } from '@/lib/billing/subscription-service';
import { billingPlatformEnabled } from '@/lib/billing/platform';

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
    // Dunning first (an exhausted retry ends the subscription, which starts retention). Dark unless the billing flag is on.
    let dunning: unknown = { skipped: dryRun ? 'dry_run' : 'flag_off' };
    if (!dryRun && billingPlatformEnabled()) {
      try {
        dunning = await runDunning(admin);
      } catch (e) {
        dunning = { error: e instanceof Error ? e.message.slice(0, 120) : 'error' };
      }
    }
    // Personal data after the subscription ended (user's own choice). Counts only.
    let subscription_retention: unknown = null;
    try {
      subscription_retention = await runSubscriptionRetention(admin, { dryRun });
    } catch (e) {
      subscription_retention = { error: e instanceof Error ? e.message.slice(0, 120) : 'error' };
    }
    // Nightly admin-access audit (rule prefilter → cheap model only when something is flagged). Pseudonymous payload.
    let access_audit: unknown = { skipped: 'dry_run' };
    if (!dryRun) {
      try {
        const { runAccessAudit } = await import('@/lib/platform/access/audit-job');
        const { alertOwnerSecurity } = await import('@/lib/ops/device-notify');
        access_audit = await runAccessAudit(admin, { alert: async (t) => { await alertOwnerSecurity(admin, null, t, 'ביקורת גישה לילית'); } });
      } catch (e) {
        access_audit = { error: e instanceof Error ? e.message.slice(0, 120) : 'error' };
      }
    }
    console.log('[cron/log-retention]', JSON.stringify({ deleted: out.deleted, db_bytes: out.db_bytes, alert: out.alert, dunning, subscription_retention, access_audit }));
    return NextResponse.json({ ok: true, ...out, dunning, subscription_retention, access_audit });
  } catch (e) {
    console.error('[cron/log-retention] failed', e instanceof Error ? e.message : 'error');
    return NextResponse.json({ ok: false, error: 'retention_failed' }, { status: 500 });
  }
}

export const GET = POST;
