import 'server-only';
/**
 * On-demand only: pulls the provider-side request logs around ONE consent event (no continuous
 * copying). Database provider: Supabase Management API `analytics/endpoints/logs` (ClickHouse SQL).
 * Hosting provider: Vercel API (deployment that served the request; Vercel keeps runtime logs only
 * briefly and has no historical query API without a log drain, which we deliberately do not run).
 * Tokens are optional, read-only scoped: LEGAL_LOGS_SUPABASE_TOKEN, LEGAL_LOGS_VERCEL_TOKEN.
 */
export type ProviderLogs = { provider: string; source: string; status: 'ok' | 'not_configured' | 'error' | 'empty'; note?: string; rows: Array<Record<string, unknown>> };

const sbRef = () => /https:\/\/([a-z0-9]+)\.supabase\.co/.exec(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')?.[1] ?? null;

export function logWindow(createdAt: string, padSec = 60) {
  const t = new Date(createdAt).getTime();
  return { start: new Date(t - padSec * 1000).toISOString(), end: new Date(t + padSec * 1000).toISOString() };
}

export function supabaseLogSql(userId: string): string {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error('bad_user');
  // Only requests touching this user's consent/evidence rows; bounded result.
  return `SELECT timestamp, event_message, log_attributes['request.path'] AS path, log_attributes['response.status_code'] AS status FROM logs WHERE (position(event_message, 'consent_evidence') > 0 OR position(event_message, 'user_consents') > 0 OR position(event_message, 'admin_audit_log') > 0 OR position(event_message, '${userId}') > 0) ORDER BY timestamp LIMIT 200`;
}

export async function fetchSupabaseLogs(userId: string, createdAt: string, f: typeof fetch = fetch): Promise<ProviderLogs> {
  const token = process.env.LEGAL_LOGS_SUPABASE_TOKEN?.trim();
  const ref = sbRef();
  const source = `Supabase Management API · project ${ref ?? '?'} · analytics/endpoints/logs`;
  if (!token || !ref) return { provider: 'supabase', source, status: 'not_configured', note: 'LEGAL_LOGS_SUPABASE_TOKEN missing', rows: [] };
  const w = logWindow(createdAt);
  const q = new URLSearchParams({ sql: supabaseLogSql(userId), iso_timestamp_start: w.start, iso_timestamp_end: w.end });
  try {
    const r = await f(`https://api.supabase.com/v1/projects/${ref}/analytics/endpoints/logs?${q}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) });
    const j = (await r.json().catch(() => ({}))) as { result?: Array<Record<string, unknown>>; error?: unknown };
    if (!r.ok || j.error) return { provider: 'supabase', source, status: 'error', note: `http ${r.status}`, rows: [] };
    const rows = j.result ?? [];
    return { provider: 'supabase', source: `${source} · ${w.start} → ${w.end}`, status: rows.length ? 'ok' : 'empty', note: rows.length ? undefined : 'retention may have expired', rows };
  } catch (e) {
    return { provider: 'supabase', source, status: 'error', note: e instanceof Error ? e.name : 'error', rows: [] };
  }
}

export async function fetchVercelContext(createdAt: string, requestId: string | null, f: typeof fetch = fetch): Promise<ProviderLogs> {
  const token = process.env.LEGAL_LOGS_VERCEL_TOKEN?.trim();
  const project = process.env.VERCEL_PROJECT_ID ?? '';
  const team = process.env.LEGAL_LOGS_VERCEL_TEAM_ID ?? '';
  const source = `Vercel REST API · project ${project || '?'} · /v6/deployments`;
  if (!token || !project) return { provider: 'vercel', source, status: 'not_configured', note: 'LEGAL_LOGS_VERCEL_TOKEN missing', rows: [] };
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
