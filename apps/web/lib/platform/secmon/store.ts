import type { SupabaseClient } from '@supabase/supabase-js';
import { isAlertable, type Finding, type SecmonConfig } from './types';

const SOURCE_RE = /^[a-z0-9][a-z0-9_.:-]{1,63}$/;

export async function recordHeartbeat(db: SupabaseClient, source: string, ok: boolean, detail?: string): Promise<void> {
  if (!SOURCE_RE.test(source)) throw new Error('bad source');
  const { error } = await db.from('secmon_heartbeats').upsert({ source, last_seen: new Date().toISOString(), last_ok: ok, detail: detail?.slice(0, 300) ?? null, deadman_alerted_at: null }, { onConflict: 'source' });
  if (error) throw new Error(error.message);
}

/** Dead-man switch: returns sources that have not checked in within their window (and were not alerted yet). */
export async function staleHeartbeats(db: SupabaseClient, cfg: Pick<SecmonConfig, 'heartbeats'>, now = Date.now()) {
  const { data, error } = await db.from('secmon_heartbeats').select('source,last_seen,last_ok,deadman_alerted_at');
  if (error) throw new Error(error.message);
  const rows = new Map((data ?? []).map((r) => [r.source as string, r as { last_seen: string; last_ok: boolean; deadman_alerted_at: string | null }]));
  const stale: { source: string; label: string; hours: number | null; failed: boolean }[] = [];
  for (const hb of cfg.heartbeats) {
    const r = rows.get(hb.source);
    const age = r ? (now - Date.parse(r.last_seen)) / 3_600_000 : null;
    const late = age === null || age > hb.maxAgeHours;
    if ((late || (r && !r.last_ok)) && !(r?.deadman_alerted_at && now - Date.parse(r.deadman_alerted_at) < 24 * 3_600_000)) {
      stale.push({ source: hb.source, label: hb.label, hours: age === null ? null : Math.round(age), failed: !!r && !r.last_ok && !late });
    }
  }
  return stale;
}

export async function markDeadmanAlerted(db: SupabaseClient, sources: string[]) {
  const now = new Date().toISOString();
  for (const s of sources) {
    const { data } = await db.from('secmon_heartbeats').update({ deadman_alerted_at: now }).eq('source', s).select('source');
    if (!data?.length) await db.from('secmon_heartbeats').insert({ source: s, last_seen: new Date(0).toISOString(), last_ok: false, detail: 'never seen', deadman_alerted_at: now });
  }
}

/** Upsert findings; returns those that are alertable (high/critical) and never alerted. Resolves findings no longer seen. */
export async function upsertFindings(db: SupabaseClient, findings: Finding[], kindsChecked: string[]): Promise<Finding[]> {
  const now = new Date().toISOString();
  const fps = findings.map((f) => f.fingerprint);
  const { data: existing } = fps.length ? await db.from('secmon_findings').select('fingerprint,alerted_at,resolved_at').in('fingerprint', fps) : { data: [] as never[] };
  const known = new Map((existing ?? []).map((r: { fingerprint: string; alerted_at: string | null; resolved_at: string | null }) => [r.fingerprint, r]));
  if (findings.length) {
    const { error } = await db.from('secmon_findings').upsert(findings.map((f) => ({ fingerprint: f.fingerprint, kind: f.kind, severity: f.severity, title: f.title.slice(0, 300), detail: f.detail?.slice(0, 1000) ?? null, last_seen: now, resolved_at: null })), { onConflict: 'fingerprint' });
    if (error) throw new Error(error.message);
  }
  if (kindsChecked.length) {
    let q = db.from('secmon_findings').update({ resolved_at: now }).is('resolved_at', null).in('kind', kindsChecked).lt('last_seen', now);
    if (fps.length) q = q.not('fingerprint', 'in', `(${fps.map((f) => `"${f.replace(/"/g, '')}"`).join(',')})`);
    await q;
  }
  return findings.filter((f) => isAlertable(f.severity) && (!known.get(f.fingerprint)?.alerted_at || known.get(f.fingerprint)?.resolved_at));
}

export async function markAlerted(db: SupabaseClient, fps: string[]) {
  if (fps.length) await db.from('secmon_findings').update({ alerted_at: new Date().toISOString() }).in('fingerprint', fps);
}
