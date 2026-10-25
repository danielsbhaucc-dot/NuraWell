import type { SupabaseClient } from '@supabase/supabase-js';
import { checkOsv } from './osv';
import { checkGhsa, checkKev } from './feeds';
import { checkSites } from './site';
import { markAlerted, markDeadmanAlerted, recordHeartbeat, staleHeartbeats, upsertFindings } from './store';
import { SEV_RANK, type Finding, type SecmonConfig } from './types';

export type Alert = (text: string, subject: string) => Promise<unknown>;

export async function checkRls(db: SupabaseClient): Promise<Finding[]> {
  const { data, error } = await db.rpc('secmon_rls_audit');
  if (error) throw new Error(error.message);
  return ((data ?? []) as { schema_name: string; table_name: string; issue: string }[]).map((r) => ({
    fingerprint: `db:${r.issue}:${r.schema_name}.${r.table_name}`, kind: 'database', severity: r.issue === 'rls_disabled' ? 'high' : 'critical',
    title: `${r.schema_name}.${r.table_name}: ${r.issue === 'rls_disabled' ? 'טבלה בלי RLS' : r.issue === 'anon_write_grant' ? 'הרשאת כתיבה ציבורית' : 'פונקציה רגישה פתוחה לציבור'}`,
  }));
}

/** Dead-man switch only (cheap; called from more than one cron so it still fires if the monitor itself stops). */
export async function runDeadman(db: SupabaseClient, cfg: SecmonConfig, notify: Alert) {
  const stale = await staleHeartbeats(db, cfg);
  if (stale.length) {
    const lines = stale.map((s) => s.failed ? `• הסריקה "${s.label}" רצה ונכשלה` : `• הסריקה "${s.label}" לא רצה${s.hours === null ? ' אף פעם' : ` כבר ${s.hours} שעות`}`);
    await notify(`⚠️ מתג בטיחות: סריקות אבטחה לא דיווחו בזמן\n${lines.join('\n')}\nצריך לבדוק שהן עדיין פועלות.`, `הסריקה ${stale[0]!.label} לא רצה`);
    await markDeadmanAlerted(db, stale.map((s) => s.source));
  }
  return stale;
}

/** Nightly monitor: deterministic, no AI. Each check is isolated; a failing feed is itself reported. */
export async function runSecmon(db: SupabaseClient, cfg: SecmonConfig, notify: Alert, opts: { heartbeatSource?: string; fetchFn?: typeof fetch } = {}) {
  const f = opts.fetchFn ?? fetch;
  const findings: Finding[] = [];
  const checked: string[] = [];
  const errors: string[] = [];
  const run = async (kind: string, fn: () => Promise<Finding[]>) => {
    try { findings.push(...(await fn())); checked.push(kind); } catch (e) { errors.push(`${kind}: ${e instanceof Error ? e.message.slice(0, 80) : 'error'}`); }
  };
  await run('dependency', () => checkOsv(cfg.deps, f));
  await run('kev', () => checkKev(cfg.kevKeywords, 14, f));
  await run('advisory', () => checkGhsa(cfg.watchPackages, cfg.deps, f));
  await run('database', () => checkRls(db));
  const site: Finding[] = [];
  try { site.push(...(await checkSites(cfg.sites, cfg.tlsWarnDays ?? 14, f))); checked.push('headers', 'tls', 'site'); } catch (e) { errors.push(`site: ${e instanceof Error ? e.message.slice(0, 80) : 'error'}`); }
  findings.push(...site);

  const fresh = await upsertFindings(db, findings, checked);
  if (fresh.length) {
    fresh.sort((a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity]);
    const lines = fresh.slice(0, 15).map((x) => `• [${x.severity === 'critical' ? 'קריטי' : 'גבוה'}] ${x.title}`);
    await notify(`🛡️ סריקת אבטחה לילית: ${fresh.length} ממצאים חדשים\n${lines.join('\n')}${fresh.length > 15 ? `\n…ועוד ${fresh.length - 15}` : ''}`, `סריקת אבטחה: ${fresh.length} ממצאים חדשים בדרגה גבוהה`);
    await markAlerted(db, fresh.map((x) => x.fingerprint));
  }
  if (opts.heartbeatSource) await recordHeartbeat(db, opts.heartbeatSource, errors.length === 0, errors.join('; ') || `findings=${findings.length}`);
  const stale = await runDeadman(db, cfg, notify);
  return { findings: findings.length, alerted: fresh.length, errors, stale: stale.map((s) => s.source), bySeverity: countBy(findings) };
}

function countBy(fs: Finding[]) { const c: Record<string, number> = {}; for (const x of fs) c[x.severity] = (c[x.severity] ?? 0) + 1; return c; }
