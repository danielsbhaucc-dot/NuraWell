import { createHmac } from 'node:crypto';
import { createAdminClient, createCentralAdminClient } from '@/lib/supabase/admin';

/**
 * Daily, aggregates-only usage report to the parent-company console (platform-core connector spec):
 * body = JSON of plain totals, signature = HMAC-SHA256(secret, `${ts}.${body}`), verified centrally (5-min window, replay guard).
 * Runs from an existing daily cron, never on a user request. No ids, names or text leave NuraWell — only counts and a sum.
 * Missing env ⇒ silently skipped. Never throws (callers must not change behaviour because of this).
 */
export interface UsageTotals { users: number | null; active7d: number | null; aiCost30dUsd: number | null; errors7d: number | null }

export function signUsage(secret: string, body: string, ts = Date.now()) {
  return { ts: String(ts), sig: createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex') };
}

const since = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

export async function collectUsageTotals(): Promise<UsageTotals> {
  const db = createAdminClient();
  const [users, errors, cost] = await Promise.all([
    db.from('profiles').select('id', { count: 'exact', head: true }),
    db.from('error_events').select('id', { count: 'exact', head: true }).gte('created_at', since(7)).in('severity', ['error', 'fatal']),
    db.from('ai_usage_events').select('cost_usd').gte('created_at', since(30)).limit(50_000),
  ]);
  const sum = cost.error ? null : Math.round((cost.data ?? []).reduce((a, r) => a + Number((r as { cost_usd: number | string }).cost_usd || 0), 0) * 10_000) / 10_000;
  return { users: users.error ? null : users.count ?? null, active7d: null, aiCost30dUsd: sum, errors7d: errors.error ? null : errors.count ?? null };
}

export async function sendUsageFeed(): Promise<'sent' | 'skipped' | 'failed'> {
  const secret = process.env.CENTRAL_METRICS_FEED_SECRET;
  if (!secret || !process.env.CENTRAL_SUPABASE_URL || !process.env.CENTRAL_SUPABASE_SECRET_KEY) return 'skipped';
  try {
    const body = JSON.stringify(await collectUsageTotals());
    const { ts, sig } = signUsage(secret, body);
    const { error } = await createCentralAdminClient().rpc('central_ingest_metrics', { p_product: 'nurawell', p_body: body, p_ts: ts, p_sig: sig });
    if (error) { console.warn('[usage-feed] rejected'); return 'failed'; }
    return 'sent';
  } catch {
    console.warn('[usage-feed] failed');
    return 'failed';
  }
}
