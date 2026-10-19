/** Server-only loaders for the Ops logs: redact on the way out (allow-listed detail keys only). */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import type { LogEvent } from './insights';
import type { ErrRow, IssueStatus } from './errors';
import { redactError } from './delivery';

const SAFE_KEYS = new Set(['label', 'location', 'mode', 'reason', 'via', 'devices', 'parent', 'count', 'kind', 'purpose', 'error']);
const tag = (id: string | null) => (id ? `u-${createHash('sha256').update(id).digest('hex').slice(0, 6)}` : null);

export function redactDetail(d: Record<string, unknown> | null): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(d ?? {})) {
    if (!SAFE_KEYS.has(k)) continue;
    out[k] = typeof v === 'string' ? redactError(v).slice(0, 120) : typeof v === 'number' || typeof v === 'boolean' ? v : null;
  }
  return out;
}

export async function loadEvents(db: SupabaseClient, sinceIso: string, beforeIso?: string, limit = 400): Promise<LogEvent[]> {
  let a = db.from('admin_audit_log').select('id, created_at, actor_id, path, detail').eq('method', 'SECURITY').gte('created_at', sinceIso).order('created_at', { ascending: false }).limit(limit);
  let d = db.from('delivery_log').select('id, created_at, channel, purpose, ok, provider_id, error').gte('created_at', sinceIso).order('created_at', { ascending: false }).limit(limit);
  if (beforeIso) { a = a.lt('created_at', beforeIso); d = d.lt('created_at', beforeIso); }
  const [{ data: au }, { data: de }] = await Promise.all([a, d]);
  const out: LogEvent[] = [];
  for (const r of (au ?? []) as { id: number; created_at: string; actor_id: string | null; path: string; detail: Record<string, unknown> }[]) {
    const fid = typeof r.detail?.id === 'string' ? `flow-${createHash('sha256').update(r.detail.id).digest('hex').slice(0, 10)}` : null;
    out.push({ id: `a${r.id}`, at: r.created_at, source: 'audit', event: r.path, actor: tag(r.actor_id), flowId: fid, detail: redactDetail(r.detail) });
  }
  for (const r of (de ?? []) as { id: number; created_at: string; channel: string; purpose: string; ok: boolean; provider_id: string | null; error: string | null }[]) {
    out.push({ id: `d${r.id}`, at: r.created_at, source: 'delivery', event: `${r.channel}:${r.purpose}`, actor: null, ok: r.ok, flowId: null, detail: { provider: r.provider_id ? 'יש מזהה ספק' : null, error: r.error } });
  }
  return out.sort((x, y) => y.at.localeCompare(x.at)).slice(0, limit);
}

export async function knownPlaces(db: SupabaseClient, beforeIso: string): Promise<Set<string>> {
  const { data } = await db.from('admin_audit_log').select('detail').eq('method', 'SECURITY').eq('path', 'ops_login_pending').lt('created_at', beforeIso).order('created_at', { ascending: false }).limit(200);
  return new Set(((data ?? []) as { detail: { location?: string } }[]).map((r) => r.detail?.location ?? '').filter(Boolean));
}

export async function loadErrors(db: SupabaseClient, days = 7): Promise<{ rows: ErrRow[]; states: Map<string, IssueStatus> }> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const [{ data }, { data: st }] = await Promise.all([
    db.from('error_events').select('id, created_at, severity, source, route, message, user_id').gte('created_at', since).order('created_at', { ascending: false }).limit(2000),
    db.from('error_issue_state').select('fingerprint, status'),
  ]);
  return { rows: (data ?? []) as ErrRow[], states: new Map(((st ?? []) as { fingerprint: string; status: IssueStatus }[]).map((s) => [s.fingerprint, s.status])) };
}
