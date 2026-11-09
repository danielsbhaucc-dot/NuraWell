import { signUsage as kitSignUsage } from '@core/security-privacy/feed';
import { createAdminClient } from '@/lib/supabase/admin';
import { centralLinkConfigured, createCentralLinkClient, sendCentralSecurityStatus } from '@/lib/central/central-link';

/**
 * Daily, aggregates-only usage report to the parent-company console (platform-core connector spec):
 * body = JSON of plain totals, signature = HMAC-SHA256(secret, `${ts}.${body}`), verified centrally (5-min window, replay guard).
 * Runs from an existing daily cron, never on a user request. No ids, names or text leave NuraWell — only counts and a sum.
 * Missing env ⇒ silently skipped. Never throws (callers must not change behaviour because of this).
 */
export interface UsageTotals { users: number | null; active7d: number | null; aiCost30dUsd: number | null; errors7d: number | null }

/** Same signature as central's verifier — the shared platform-core implementation. */
export const signUsage = kitSignUsage;

const since = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

// skipcq: JS-0067, JS-R1005 -- ES module export
export async function collectUsageTotals(): Promise<UsageTotals> {
  const db = createAdminClient();
  const [users, active, errors, cost] = await Promise.all([
    db.from('profiles').select('id', { count: 'exact', head: true }),
    db.from('profiles').select('id', { count: 'exact', head: true }).gte('last_active_at', since(7)),
    db.from('error_events').select('id', { count: 'exact', head: true }).gte('created_at', since(7)).in('severity', ['error', 'fatal']),
    db.from('ai_usage_events').select('cost_usd').gte('created_at', since(30)).limit(50_000),
  ]);
  const sum = cost.error ? null : Math.round((cost.data ?? []).reduce((a, r) => a + Number((r as { cost_usd: number | string }).cost_usd || 0), 0) * 10_000) / 10_000;
  return { users: users.error ? null : users.count ?? null, active7d: active.error ? null : active.count ?? null, aiCost30dUsd: sum, errors7d: errors.error ? null : errors.count ?? null };
}

// skipcq: JS-0067, JS-R1005 -- ES module export
export async function sendUsageFeed(): Promise<'sent' | 'skipped' | 'failed'> {
  const secret = process.env.CENTRAL_METRICS_FEED_SECRET;
  if (!secret || !centralLinkConfigured()) return 'skipped';
  try {
    const body = JSON.stringify(await collectUsageTotals());
    const { ts, sig } = signUsage(secret, body);
    const { error } = await createCentralLinkClient().rpc('central_ingest_metrics', { p_product: 'nurawell', p_body: body, p_ts: ts, p_sig: sig });
    if (error) { console.warn('[usage-feed] rejected'); return 'failed'; }
    return 'sent';
  } catch {
    console.warn('[usage-feed] failed');
    return 'failed';
  }
}

/** Daily security status for the parent console (aggregates only). Piggybacks on the same daily cron; never throws. */
// skipcq: JS-0067, JS-R1005 -- ES module export
export async function sendSecurityStatusFeed(encOk: boolean): Promise<string> {
  try {
    const db = createAdminClient(), now = new Date().toISOString();
    const countOf = (q: PromiseLike<{ count: number | null; error: unknown }>) => Promise.resolve(q).then((r) => (r.error ? null : r.count ?? null), () => null);
    const [denied24h, loginFail24h, ipBlocksActive, openIncidents, events24h, lock, audit] = await Promise.all([
      countOf(db.from('security_signals').select('id', { count: 'exact', head: true }).in('kind', ['admin_401', 'admin_403']).gte('created_at', since(1))),
      countOf(db.from('security_signals').select('id', { count: 'exact', head: true }).eq('kind', 'login_fail').gte('created_at', since(1))),
      countOf(db.from('ip_blocks').select('ip_hash', { count: 'exact', head: true }).gt('blocked_until', now)),
      countOf(db.from('security_incidents').select('id', { count: 'exact', head: true }).neq('status', 'closed')),
      countOf(db.from('ops_security_events').select('id', { count: 'exact', head: true }).gte('created_at', since(1))),
      db.from('ops_lockdown').select('active').eq('id', 1).maybeSingle(),
      db.from('access_audit_runs').select('started_at, flagged').gte('started_at', since(7)).order('started_at', { ascending: false }).limit(50),
    ]);
    const runs = (audit.data ?? []) as { started_at: string; flagged: number }[];
    const { KIT } = await import('@core/security-privacy');
    return await sendCentralSecurityStatus({ kits: { [KIT.name]: KIT.version }, encOk, denied24h, loginFail24h, ipBlocksActive, openIncidents, events24h,
      lockdown: lock.error ? null : Boolean((lock.data as { active?: boolean } | null)?.active),
      lastAccessAudit: runs[0] ? new Date(runs[0].started_at).toISOString() : null,
      accessAuditFlagged7d: audit.error ? null : runs.reduce((a, r) => a + (r.flagged || 0), 0) });
  } catch { return 'failed'; }
}
