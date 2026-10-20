#!/usr/bin/env node
/**
 * Manual run of the restore drill (compliance doc 08) + provider backup posture.
 * The drill itself is public.owner_restore_drill() (migration 000147); it also runs automatically
 * each month from Gideon's monthly digest cron. Env: SUPABASE_ACCESS_TOKEN (never printed), SUPABASE_PROJECT_REF.
 */
const REF = process.env.SUPABASE_PROJECT_REF || 'csxsxvzowlswahmfcsjk';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) { console.error('SUPABASE_ACCESS_TOKEN missing'); process.exit(2); }
const api = async (path, init = {}) => {
  const r = await fetch(`https://api.supabase.com/v1${path}`, { ...init, headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' } });
  if (!r.ok) throw new Error(`${path} → ${r.status}`);
  return r.json();
};
const sql = (query) => api(`/projects/${REF}/database/query`, { method: 'POST', body: JSON.stringify({ query }) });

const b = await api(`/projects/${REF}/database/backups`);
const proj = await api(`/projects/${REF}`);
const org = await api(`/organizations/${proj.organization_id}`);
const posture = { plan: org.plan, pitr: Boolean(b.pitr_enabled), daily_backups: Array.isArray(b.backups) && b.backups.length > 0, region: b.region, posture_at: new Date().toISOString() };
const [{ r }] = await sql('select public.owner_restore_drill() as r');
await sql(`update public.owner_compliance_status set meta = meta || '${JSON.stringify(posture)}'::jsonb where item_key = 'backup_drill'`);
const left = await sql(`select count(*)::int as c from pg_namespace where nspname like 'restore_drill_%'`);
const ok = Array.isArray(r.mismatched) && r.mismatched.length === 0 && left[0].c === 0;
console.log(JSON.stringify({ ok, ...r, ...posture, leftoverSchemas: left[0].c }));
process.exit(ok ? 0 : 1);
