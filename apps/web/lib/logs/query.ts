/**
 * Unified, read-only admin view over the log tables. Masked by default; `reveal` shows full values
 * (the API logs every view, reveal and export to admin_audit_log).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { logDetail } from '@/lib/logs/facts';

export type LogType = 'admin' | 'security' | 'signals' | 'errors' | 'legal' | 'gideon' | 'retention';
export type LogRow = { id: string; at: string; type: LogType; actor: string | null; action: string; target: string | null; result: string | null; ip: string | null; country: string | null; detail: string; inv?: LogInv };
/** Investigation handles (opaque ids, never shown). ipRaw is converted to ipHash by the API route and never leaves the server. */
export type LogInv = { user?: string | null; session?: string | null; ipHash?: string | null; ipRaw?: string | null };
export type LogFilters = { type: LogType; from?: string | null; to?: string | null; actor?: string | null; result?: string | null; q?: string | null; page?: number; pageSize?: number; reveal?: boolean };

type Src = { table: string; select: string; actorCol: string | null; resultCol: string | null; searchCols: string[]; map: (r: Record<string, unknown>) => Omit<LogRow, 'type'> };

const s = (v: unknown) => (v == null ? null : String(v));
const j = (v: unknown) => (v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v));

export const LOG_SOURCES: Record<LogType, Src> = {
  admin: { table: 'admin_audit_log', select: 'id,created_at,actor_id,method,path,ip,facts,detail', actorCol: 'actor_id', resultCol: 'method', searchCols: ['path'],
    map: (r) => ({ id: s(r.id)!, at: s(r.created_at)!, actor: s(r.actor_id), action: s(r.method) ?? '', target: s(r.path), result: s(r.method), ip: s(r.ip), country: s((logDetail(r) as { country?: string } | null)?.country), detail: j(logDetail(r)), inv: { user: s(r.actor_id), session: s((logDetail(r) as { session?: string } | null)?.session), ipRaw: s(r.ip) } }) },
  security: { table: 'ops_security_events', select: 'id,created_at,kind,facts,detail,alerted_at', actorCol: null, resultCol: 'kind', searchCols: ['kind'],
    map: (r) => ({ id: s(r.id)!, at: s(r.created_at)!, actor: null, action: s(r.kind) ?? '', target: null, result: r.alerted_at ? 'נשלחה התראה' : 'ממתין', ip: null, country: s((logDetail(r) as { country?: string } | null)?.country), detail: j(logDetail(r)) }) },
  signals: { table: 'security_signals', select: 'id,created_at,kind,ip_hash,actor_id,path,country,n', actorCol: 'actor_id', resultCol: 'kind', searchCols: ['path', 'kind'],
    map: (r) => ({ id: s(r.id)!, at: s(r.created_at)!, actor: s(r.actor_id), action: s(r.kind) ?? '', target: s(r.path), result: s(r.kind), ip: s(r.ip_hash), country: s(r.country), detail: r.n && Number(r.n) > 1 ? `n=${r.n}` : '', inv: { user: s(r.actor_id), ipHash: s(r.ip_hash) } }) },
  errors: { table: 'error_events', select: 'id,created_at,severity,source,route,message,user_id', actorCol: 'user_id', resultCol: 'severity', searchCols: ['route', 'source'], // message is sealed (enc:v2) — not ilike-searchable
    map: (r) => ({ id: s(r.id)!, at: s(r.created_at)!, actor: s(r.user_id), action: s(r.source) ?? '', target: s(r.route), result: s(r.severity), ip: null, country: null, detail: (s(r.message) ?? '').slice(0, 300) }) },
  legal: { table: 'legal_access_log', select: 'id,created_at,actor_id,action,user_id,detail', actorCol: 'actor_id', resultCol: 'action', searchCols: ['action'],
    map: (r) => ({ id: s(r.id)!, at: s(r.created_at)!, actor: s(r.actor_id), action: s(r.action) ?? '', target: s(r.user_id), result: s(r.action), ip: null, country: null, detail: j(r.detail) }) },
  gideon: { table: 'ceo_audit_log', select: 'id,created_at,actor,event,tool', actorCol: 'actor', resultCol: 'event', searchCols: ['tool', 'event'],
    map: (r) => ({ id: s(r.id)!, at: s(r.created_at)!, actor: s(r.actor), action: s(r.event) ?? '', target: s(r.tool), result: s(r.event), ip: null, country: null, detail: '' }) },
  retention: { table: 'log_retention_runs', select: 'id,created_at,dry_run,duration_ms,result', actorCol: null, resultCol: null, searchCols: [],
    map: (r) => {
      const t = Object.values(((r.result as { tables?: Record<string, { eligible?: number; deleted?: number }> } | null)?.tables) ?? {});
      const del = t.reduce((a, x) => a + (x.deleted ?? 0), 0); const el = t.reduce((a, x) => a + (x.eligible ?? 0), 0);
      return { id: s(r.id)!, at: s(r.created_at)!, actor: 'cron', action: r.dry_run ? 'בדיקה בלבד' : 'ניקוי', target: null, result: `נמחקו ${del} מתוך ${el} שעברו את התקופה`, ip: null, country: null, detail: r.duration_ms != null ? `${r.duration_ms}ms` : '' };
    } },
};

export const LOG_TYPE_HE: Record<LogType, string> = { admin: 'גישת מנהלים', security: 'אירועי אבטחה', signals: 'אותות חשודים', errors: 'שגיאות', legal: 'גישה משפטית', gideon: 'גדעון', retention: 'ריצות ניקוי' };
export const isLogType = (v: unknown): v is LogType => typeof v === 'string' && v in LOG_SOURCES;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE = /\+?\d[\d -]{7,}\d/g;
const IPV4 = /\b(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}\b/g;

export function maskId(v: string | null): string | null {
  if (!v) return v;
  if (UUID.test(v)) return `${v.slice(0, 4)}…${v.slice(-4)}`;
  return v.length > 12 ? `${v.slice(0, 6)}…` : v;
}
export function maskIp(v: string | null): string | null {
  if (!v) return v;
  const m = v.match(/^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  if (m) return `${m[1]}.${m[2]}.x.x`;
  if (v.includes(':')) return `${v.split(':').slice(0, 2).join(':')}:…`;
  return maskId(v);
}
export function maskText(v: string): string {
  return v.replace(EMAIL, '[email]').replace(IPV4, '$1.$2.x.x').replace(PHONE, '[phone]').replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, (u) => `${u.slice(0, 4)}…${u.slice(-4)}`);
}
export function maskRow(r: LogRow): LogRow {
  return { ...r, actor: maskId(r.actor), target: r.target && UUID.test(r.target) ? maskId(r.target) : r.target ? maskText(r.target) : r.target, ip: maskIp(r.ip), detail: maskText(r.detail) };
}

const clean = (v: string) => v.replace(/[%,()*\\]/g, ' ').trim().slice(0, 80);
const iso = (v?: string | null) => (v && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null);

export async function queryLogs(db: SupabaseClient, f: LogFilters): Promise<{ rows: LogRow[]; total: number; page: number; pageSize: number }> {
  const src = LOG_SOURCES[f.type];
  const pageSize = Math.min(Math.max(f.pageSize ?? 50, 1), 5000);
  const page = Math.max(f.page ?? 1, 1);
  let q = db.from(src.table).select(src.select, { count: 'exact' });
  const from = iso(f.from); const to = iso(f.to);
  if (from) q = q.gte('created_at', from);
  if (to) q = q.lte('created_at', to);
  if (f.actor && src.actorCol) {
    const a = clean(f.actor);
    q = UUID.test(a) || src.actorCol === 'actor' ? q.eq(src.actorCol, a) : q;
  }
  if (f.result && src.resultCol) q = q.eq(src.resultCol, clean(f.result));
  if (f.q && src.searchCols.length) {
    const t = clean(f.q);
    if (t) q = q.or(src.searchCols.map((c) => `${c}.ilike.*${t}*`).join(','));
  }
  const { data, error, count } = await q.order('created_at', { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1);
  if (error) throw new Error(error.message);
  const rows = ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({ type: f.type, ...src.map(r) }) as LogRow);
  return { rows: f.reveal ? rows : rows.map(maskRow), total: count ?? rows.length, page, pageSize };
}

export function toCsv(rows: LogRow[]): string {
  const cols: (keyof LogRow)[] = ['at', 'type', 'actor', 'action', 'target', 'result', 'ip', 'country', 'detail'];
  const esc = (v: unknown) => {
    let t = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`; // CSV formula injection guard
    return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return '\uFEFF' + [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\r\n');
}

export function filtersFrom(url: URL): LogFilters {
  const p = url.searchParams;
  const type = p.get('type');
  return { type: isLogType(type) ? type : 'admin', from: p.get('from'), to: p.get('to'), actor: p.get('actor'), result: p.get('result'), q: p.get('q'),
    page: Number(p.get('page')) || 1, pageSize: Number(p.get('pageSize')) || 50, reveal: p.get('reveal') === '1' };
}
