import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import { checkOsv, headerFindings, inRange, osvSeverity, runDeadman, staleHeartbeats } from '../lib/platform/secmon';
import { checkSites } from '../lib/platform/secmon/site';
import { ageEncrypt, logicalDump } from '../lib/platform/backup/logical';

vi.mock('server-only', () => ({}));

const fakeDb = (rows: unknown[]) => ({
  from: () => ({
    select: async () => ({ data: rows, error: null }),
    update: () => ({ eq: () => ({ select: async () => ({ data: [{}] }) }) }),
    insert: async () => ({}),
  }),
}) as never;

const cfg = { heartbeats: [{ source: 'a.nightly', label: 'א', maxAgeHours: 48 }, { source: 'b.nightly', label: 'ב', maxAgeHours: 48 }] };

describe('secmon dead-man switch', () => {
  const now = Date.parse('2026-10-25T12:00:00Z');
  it('flags never-seen, late and failed sources; ignores fresh ok ones', async () => {
    const s = await staleHeartbeats(fakeDb([{ source: 'b.nightly', last_seen: '2026-10-22T12:00:00Z', last_ok: true, deadman_alerted_at: null }]), cfg, now);
    expect(s.map((x) => [x.source, x.hours])).toEqual([['a.nightly', null], ['b.nightly', 72]]);
    const f = await staleHeartbeats(fakeDb([{ source: 'a.nightly', last_seen: '2026-10-25T10:00:00Z', last_ok: false, deadman_alerted_at: null }, { source: 'b.nightly', last_seen: '2026-10-25T10:00:00Z', last_ok: true, deadman_alerted_at: null }]), cfg, now);
    expect(f).toEqual([{ source: 'a.nightly', label: 'א', hours: 2, failed: true }]);
  });
  it('does not re-alert within 24h', async () => {
    const s = await staleHeartbeats(fakeDb([{ source: 'a.nightly', last_seen: '2026-10-20T00:00:00Z', last_ok: true, deadman_alerted_at: '2026-10-25T06:00:00Z' }, { source: 'b.nightly', last_seen: '2026-10-25T11:00:00Z', last_ok: true, deadman_alerted_at: null }]), cfg, now);
    expect(s).toEqual([]);
  });
  it('alert says "הסריקה X לא רצה"', async () => {
    const alert = vi.fn(async () => null);
    await runDeadman(fakeDb([]), cfg as never, alert);
    expect(alert).toHaveBeenCalledOnce();
    const [text, subject] = alert.mock.calls[0] as unknown as [string, string];
    expect(subject).toBe('הסריקה א לא רצה');
    expect(text).toContain('הסריקה "ב" לא רצה');
  });
});

describe('secmon checks', () => {
  it('semver ranges', () => {
    expect(inRange('15.0.3', '>= 15.0.0, < 15.0.5')).toBe(true);
    expect(inRange('15.0.5', '>= 15.0.0, < 15.0.5')).toBe(false);
  });
  it('OSV severity from database_specific / CVSS', () => {
    expect(osvSeverity({ database_specific: { severity: 'CRITICAL' } } as never)).toBe('critical');
    expect(osvSeverity({ database_specific: { severity: 'MODERATE' } } as never)).toBe('moderate');
  });
  it('OSV batch → findings with stable fingerprints', async () => {
    const f = vi.fn(async (url: string) => {
      if (url.endsWith('/querybatch')) return new Response(JSON.stringify({ results: [{ vulns: [{ id: 'GHSA-x' }] }, {}] }));
      return new Response(JSON.stringify({ id: 'GHSA-x', summary: 'bad', database_specific: { severity: 'HIGH' } }));
    });
    const out = await checkOsv([{ name: 'next', version: '15.0.0' }, { name: 'zod', version: '3.0.0' }], f as never);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ fingerprint: 'osv:next@15.0.0:GHSA-x', severity: 'high' });
  });
  it('missing security headers are reported', () => {
    const ok = headerFindings('https://x.test/', new Headers({ 'strict-transport-security': 'max-age=63072000', 'x-content-type-options': 'nosniff', 'content-security-policy': "frame-ancestors 'none'", 'referrer-policy': 'strict-origin' }));
    expect(ok).toEqual([]);
    expect(headerFindings('https://x.test/', new Headers()).length).toBeGreaterThanOrEqual(4);
  });
  it('TLS expiring soon is high', async () => {
    const f = vi.fn(async () => new Response('', { headers: { 'strict-transport-security': 'max-age=63072000', 'x-content-type-options': 'nosniff', 'content-security-policy': "frame-ancestors 'none'", 'referrer-policy': 'no-referrer' } }));
    const out = await checkSites(['https://x.test/'], 14, f as never, async () => 5);
    expect(out.some((x) => x.kind === 'tls' && (x.severity === 'high' || x.severity === 'critical'))).toBe(true);
  });
});

describe('logical backup', () => {
  it('pages tables, verifies, and produces a gzip JSONL with manifest', async () => {
    const rpc = vi.fn(async (fn: string, a?: Record<string, unknown>) => {
      if (fn === 'ops_backup_tables') return { data: [{ schema_name: 'public', table_name: 't' }], error: null };
      if (fn === 'ops_backup_table') return { data: a!.p_offset === 0 ? [{ id: 1 }, { id: 2 }] : [], error: null };
      if (fn === 'ops_backup_verify') return { data: (a!.p_rows as unknown[]).length, error: null };
      return { data: null, error: { message: 'x' } };
    });
    const r = await logicalDump({ rpc } as never, { verify: true, createdAt: '2026-10-25T00:00:00Z' });
    expect(r.tables).toEqual([{ schema: 'public', table: 't', rows: 2, verified: 2 }]);
    const lines = gunzipSync(r.plain).toString().trim().split('\n').map((l) => JSON.parse(l));
    expect(lines[0]).toMatchObject({ format: 'logical-jsonl-v1', tables: [{ schema: 'public', table: 't', rows: 2 }] });
    expect(lines[1]).toEqual({ s: 'public', t: 't', rows: [{ id: 1 }, { id: 2 }] });
  });
  it('age encryption round-trips with the matching identity', async () => {
    const age = await import('age-encryption');
    const id = await age.generateIdentity();
    const ct = await ageEncrypt(new TextEncoder().encode('hello'), [await age.identityToRecipient(id)]);
    const d = new age.Decrypter(); d.addIdentity(id);
    expect(new TextDecoder().decode(await d.decrypt(ct))).toBe('hello');
  });
  it('app recipient equals the offline key recipient used by the scripts', () => {
    const pub = readFileSync(join(__dirname, '../../../scripts/backup/db-backup.age.pub'), 'utf8').trim();
    const src = readFileSync(join(__dirname, '../lib/ops/db-backup-run.ts'), 'utf8');
    expect(pub).toMatch(/^age1[0-9a-z]+$/);
    expect(src).toContain(`'${pub}'`);
  });
});

describe('workflows', () => {
  const wf = (n: string) => readFileSync(join(__dirname, '../../../.github/workflows', n), 'utf8');
  it.skipIf(!existsSync(join(__dirname, '../../../.github/workflows/main-gate.yml')))('check names match what Vercel and the gate wait for', () => {
    expect(wf('ci.yml')).toMatch(/\n  ci:\n    name: ci\n/);
    expect(wf('main-gate.yml')).toMatch(/name: main-gate\n/);
    expect(wf('main-gate.yml')).toContain('check_name=ci');
  });
  it('root vercel.json schedules the backup and the monitor', () => {
    const v = JSON.parse(readFileSync(join(__dirname, '../../../vercel.json'), 'utf8'));
    const paths = v.crons.map((c: { path: string }) => c.path);
    expect(paths).toEqual(expect.arrayContaining(['/api/v1/ops/db-backup/run', '/api/v1/ops/secmon/run', '/api/v1/ai/cron/log-retention']));
  });
});
