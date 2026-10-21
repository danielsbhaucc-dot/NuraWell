import 'server-only';
/**
 * On-demand only: pulls the provider-side request logs around ONE consent event (no continuous
 * copying). Database: own audit tables via service role (no account-wide token).
 * Hosting provider: Vercel API (deployment that served the request; Vercel keeps runtime logs only
 * briefly and has no historical query API without a log drain, which we deliberately do not run).
 * Tokens (LEGAL_LOGS_VERCEL_TOKEN / LEGAL_LOGS_SUPABASE_TOKEN) are only reachable via legalToken()
 * inside runEvidenceRequest() (see legal-tokens.ts): step-up, audit row per use, misuse alert.
 */
export type ProviderLogs = { provider: string; source: string; status: 'ok' | 'not_configured' | 'error' | 'empty'; note?: string; rows: Array<Record<string, unknown>> };

import { legalToken, legalTokenConfigured } from '@/lib/legal/legal-tokens';

const sbRef = () => /https:\/\/([a-z0-9]+)\.supabase\.co/.exec(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')?.[1] ?? null;

export function logWindow(createdAt: string, padSec = 60) {
  const t = new Date(createdAt).getTime();
  return { start: new Date(t - padSec * 1000).toISOString(), end: new Date(t + padSec * 1000).toISOString() };
}

type RpcClient = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message?: string } | null }> };

/**
 * Database side without any account-wide token: a service-role-only SECURITY DEFINER function reads
 * auth.audit_log_entries + admin_audit_log for this user in a ±10 min window (migration 000158).
 */
export async function fetchSupabaseLogs(userId: string, createdAt: string, admin: RpcClient | null): Promise<ProviderLogs> {
  const source = `Database audit tables (auth.audit_log_entries, admin_audit_log) · project ${sbRef() ?? '?'}`;
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return { provider: 'supabase', source, status: 'error', note: 'bad_user', rows: [] };
  if (!admin) return { provider: 'supabase', source, status: 'not_configured', note: 'no admin client', rows: [] };
  const w = logWindow(createdAt, 600);
  try {
    const { data, error } = await admin.rpc('legal_db_audit_window', { p_user: userId, p_start: w.start, p_end: w.end });
    if (error) return { provider: 'supabase', source, status: 'error', note: error.message?.slice(0, 120) ?? 'rpc_error', rows: [] };
    const rows = (data as Array<Record<string, unknown>> | null) ?? [];
    return { provider: 'supabase', source: `${source} · ${w.start} → ${w.end}`, status: rows.length ? 'ok' : 'empty', note: rows.length ? undefined : 'no audit rows in window', rows };
  } catch (e) {
    return { provider: 'supabase', source, status: 'error', note: e instanceof Error ? e.name : 'error', rows: [] };
  }
}

export async function fetchVercelContext(createdAt: string, requestId: string | null, f: typeof fetch = fetch): Promise<ProviderLogs> {
  const project = process.env.VERCEL_PROJECT_ID ?? '';
  const team = process.env.LEGAL_LOGS_VERCEL_TEAM_ID ?? '';
  const source = `Vercel REST API · project ${project || '?'} · /v6/deployments`;
  if (!legalTokenConfigured('vercel') || !project) return { provider: 'vercel', source, status: 'not_configured', note: 'LEGAL_LOGS_VERCEL_TOKEN missing', rows: [] };
  const token = await legalToken('vercel', 'platform-logs:vercel');
  if (!token) return { provider: 'vercel', source, status: 'error', note: 'token_blocked_outside_evidence_request', rows: [] };
  try {
    const until = new Date(createdAt).getTime();
    const q = new URLSearchParams({ projectId: project, target: 'production', until: String(until), limit: '1', state: 'READY', ...(team ? { teamId: team } : {}) });
    const r = await f(`https://api.vercel.com/v6/deployments?${q}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) });
    const j = (await r.json().catch(() => ({}))) as { deployments?: Array<Record<string, unknown>> };
    if (!r.ok) return { provider: 'vercel', source, status: 'error', note: `http ${r.status}`, rows: [] };
    const d = j.deployments?.[0];
    const rows = d ? [{ deployment_id: d.uid, url: d.url, created: d.created, commit: (d.meta as Record<string, unknown> | undefined)?.githubCommitSha ?? null, request_id: requestId }] : [];
    return { provider: 'vercel', source, status: rows.length ? 'ok' : 'empty', note: 'deployment that served the request; request-level runtime logs are not retained by Vercel for historical query', rows };
  } catch (e) {
    return { provider: 'vercel', source, status: 'error', note: e instanceof Error ? e.name : 'error', rows: [] };
  }
}

/** Supabase Management API (provider-side auth logs) for this user, ±10 min. ClickHouse `logs` endpoint. */
export async function fetchSupabaseProviderLogs(userId: string, createdAt: string, f: typeof fetch = fetch): Promise<ProviderLogs> {
  const ref = sbRef();
  const source = `Supabase Management API · project ${ref ?? '?'} · /analytics/endpoints/logs (auth_logs)`;
  if (!legalTokenConfigured('supabase') || !ref) return { provider: 'supabase-platform', source, status: 'not_configured', note: 'LEGAL_LOGS_SUPABASE_TOKEN missing', rows: [] };
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return { provider: 'supabase-platform', source, status: 'error', note: 'bad_user', rows: [] };
  const token = await legalToken('supabase', 'platform-logs:supabase');
  if (!token) return { provider: 'supabase-platform', source, status: 'error', note: 'token_blocked_outside_evidence_request', rows: [] };
  const w = logWindow(createdAt, 600);
  const sql = `SELECT timestamp, source, event_message FROM logs WHERE source = 'auth_logs' AND position(event_message, '${userId.toLowerCase()}') > 0 ORDER BY timestamp ASC LIMIT 500`;
  try {
    const q = new URLSearchParams({ sql, iso_timestamp_start: w.start, iso_timestamp_end: w.end });
    const r = await f(`https://api.supabase.com/v1/projects/${ref}/analytics/endpoints/logs?${q}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) });
    const j = (await r.json().catch(() => ({}))) as { result?: Array<Record<string, unknown>>; error?: unknown };
    if (!r.ok || j.error) return { provider: 'supabase-platform', source, status: 'error', note: r.ok ? 'query_error' : `http ${r.status}`, rows: [] };
    const rows = j.result ?? [];
    return { provider: 'supabase-platform', source: `${source} · ${w.start} → ${w.end}`, status: rows.length ? 'ok' : 'empty', note: rows.length ? undefined : 'no provider auth log rows in window', rows };
  } catch (e) {
    return { provider: 'supabase-platform', source, status: 'error', note: e instanceof Error ? e.name : 'error', rows: [] };
  }
}
