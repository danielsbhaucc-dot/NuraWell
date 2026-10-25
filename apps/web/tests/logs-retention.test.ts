import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { LOG_POLICY, storageLevel, FREE_DB_LIMIT_BYTES, retentionHe } from '@/lib/logs/policy';
import { maskId, maskIp, maskRow, maskText, toCsv, type LogRow } from '@/lib/logs/query';
import { shouldBlock, isNewPlace, hashIp, DENIAL_THRESHOLD, BLOCK_MS } from '@/lib/logs/signals';
import { normalizeStorage, storageAlert, vacuumCandidates } from '@/lib/logs/retention-job';

const root = join(__dirname, '..', '..', '..');
const migDir = join(root, 'supabase', 'migrations');
const mig = readFileSync(join(migDir, readdirSync(migDir).find((f) => f.startsWith('000181_'))!), 'utf8');

describe('log retention policy', () => {
  it('TS policy mirrors SQL log_retention_policy()', () => {
    const sql = [...mig.matchAll(/\('([a-z_]+)','([a-z_]+)',(\d+),'(operational|access|legal)',(null|'[^)]*')\)/g)]
      .map((m) => ({ table: m[1], tsCol: m[2], days: Number(m[3]), klass: m[4], extra: m[5] === 'null' ? undefined : m[5].slice(1, -1).replace(/''/g, "'") }));
    expect(sql).toEqual(LOG_POLICY.map(({ table, tsCol, days, klass, extra }) => ({ table, tsCol, days, klass, extra })));
  });
  it('access logs keep 24 months; legal never shorter than 7 years', () => {
    for (const p of LOG_POLICY.filter((x) => x.klass === 'access')) expect(p.days).toBe(730);
    for (const p of LOG_POLICY.filter((x) => x.klass === 'legal')) expect(p.days).toBeGreaterThanOrEqual(2555);
    for (const p of LOG_POLICY.filter((x) => x.klass === 'operational' && x.table !== 'log_retention_runs')) expect(p.days).toBeLessThanOrEqual(90);
  });
  it('SQL deletes only operational + access, never legal', () => {
    expect(mig).toMatch(/klass in \('operational', ?'access'\)/);
    expect(mig).not.toMatch(/vacuum full/i);
    expect(mig).toMatch(/pg_try_advisory_xact_lock/);
  });
  it('never targets user content tables', () => {
    const names = LOG_POLICY.map((p) => p.table);
    for (const t of ['ai_interactions', 'profiles', 'task_logs', 'notifications', 'user_memories']) expect(names).not.toContain(t);
  });
  it('labels retention in Hebrew', () => {
    expect(retentionHe(730)).toBe('24 חודשים');
    expect(retentionHe(30)).toBe('30 ימים');
  });
});

describe('storage monitoring', () => {
  it('levels vs free plan', () => {
    expect(storageLevel(37 * 1048576)).toBe('ok');
    expect(storageLevel(FREE_DB_LIMIT_BYTES * 0.75)).toBe('warn');
    expect(storageLevel(FREE_DB_LIMIT_BYTES * 0.9)).toBe('critical');
  });
  it('alerts only above threshold', () => {
    const s = normalizeStorage({ db_bytes: 38e6, tables: { error_events: { bytes: 2e5, rows: 58, dead: 0 } }, top_tables: [{ name: 'x', bytes: 1 }] });
    expect(storageAlert(s)).toBeNull();
    expect(storageAlert({ ...s, db_bytes: FREE_DB_LIMIT_BYTES * 0.9 })).toMatch(/כמעט מלא/);
    expect(storageAlert({ ...s, tables: [{ table: 'error_events', bytes: 30 * 1048576, rows: 1, dead: 0, last_autovacuum: null }] })).toMatch(/error_events/);
  });
  it('vacuum candidates need many dead tuples', () => {
    expect(vacuumCandidates(normalizeStorage({ tables: { a: { rows: 10, dead: 9000 }, b: { rows: 1e5, dead: 9000 } } }))).toEqual(['a']);
  });
});

describe('masking + CSV', () => {
  it('masks ids, ips, emails, phones', () => {
    expect(maskId('11111111-2222-3333-4444-555555555555')).toBe('1111…5555');
    expect(maskIp('81.2.69.160')).toBe('81.2.x.x');
    expect(maskText('mail a@b.co from 10.1.2.3 tel +972 50-123-4567')).toBe('mail [email] from 10.1.x.x tel [phone]');
    const r: LogRow = { id: '1', at: 'x', type: 'admin', actor: '11111111-2222-3333-4444-555555555555', action: 'GET', target: '/api', result: 'GET', ip: '1.2.3.4', country: 'IL', detail: '{}' };
    expect(maskRow(r)).toMatchObject({ actor: '1111…5555', ip: '1.2.x.x' });
  });
  it('csv escapes and blocks formula injection', () => {
    const csv = toCsv([{ id: '1', at: 'a', type: 'errors', actor: null, action: '=HYPERLINK("x")', target: null, result: 'a,b', ip: null, country: null, detail: '' }]);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain('"a,b"');
  });
});

describe('suspicious-pattern responses', () => {
  it('blocks only untrusted IPs above threshold', () => {
    expect(shouldBlock(DENIAL_THRESHOLD, false)).toBe(true);
    expect(shouldBlock(DENIAL_THRESHOLD - 1, false)).toBe(false);
    expect(shouldBlock(1000, true)).toBe(false);
    expect(BLOCK_MS).toBeLessThanOrEqual(60 * 60_000);
    expect(mig).toMatch(/blocked_until <= created_at \+ interval '61 minutes'/);
  });
  it('new place only when there is history and this ip is unseen', () => {
    expect(isNewPlace(false, true)).toBe(true);
    expect(isNewPlace(true, true)).toBe(false);
    expect(isNewPlace(false, false)).toBe(false);
  });
  it('hashes IPs, never stores raw', () => {
    const h = hashIp('1.2.3.4')!;
    expect(h).toMatch(/^[0-9a-f]{32}$/);
    expect(h).not.toContain('1.2.3.4');
    expect(hashIp('')).toBeNull();
  });
  it('admin guard checks blocks and records denials', () => {
    const src = readFileSync(join(__dirname, '..', 'lib/api/route-guards.ts'), 'utf8');
    expect(src).toMatch(/adminIpBlocked\(request\)/);
    expect(src).toMatch(/status: 429/);
    expect(src).toMatch(/noteAdminDenial/);
  });
  it('daily cron is scheduled and protected', () => {
    const v = JSON.parse(readFileSync(join(__dirname, '..', 'vercel.json'), 'utf8'));
    expect(v.crons.map((c: { path: string }) => c.path)).toContain('/api/v1/ai/cron/log-retention');
    const r = readFileSync(join(__dirname, '..', 'app/api/v1/ai/cron/log-retention/route.ts'), 'utf8');
    expect(r).toMatch(/authorizeCronRequest/);
  });
  it('log APIs are admin-only and log views/exports', () => {
    for (const f of ['route.ts', 'export/route.ts', 'storage/route.ts']) {
      const r = readFileSync(join(__dirname, '..', 'app/api/v1/ops/legal/logs', f), 'utf8');
      expect(r).toMatch(/requireApiAdmin\(request\)/);
    }
    expect(readFileSync(join(__dirname, '..', 'app/api/v1/ops/legal/logs/export/route.ts'), 'utf8')).toMatch(/logs_exported/);
  });
});
