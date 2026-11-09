import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetFieldCrypto, decryptValue, setDekStoreForTests, type DekStore } from '@/lib/security/field-crypto';
import type { WrappedDek } from '@/lib/security/field-envelope';
import { withFieldDecryption } from '@/lib/security/field-fetch';
import { SYSTEM_ROW } from '@/lib/security/field-registry';
import { readableGrantReason } from '@/lib/platform/access/grant-reason';
import { planGrantReason, runGrantReasonBatch } from '@/lib/privacy/pii-grant-reason-backfill';
import { liveGrant } from '@/lib/platform/access/pii-access';
import { runAccessAudit } from '@/lib/platform/access/audit-job';
import { fakeDb } from './helpers/access-fake-db';

const REASON = 'בדיקת תלונה על חיוב כפול בחשבון';
const A = '11111111-1111-4111-8111-111111111111';
const S = '22222222-2222-4222-8222-222222222222';
const BASE = 'https://x.supabase.co/rest/v1';
type Row = Record<string, unknown>;

function memStore(): DekStore {
  const rows = new Map<string, WrappedDek>();
  return {
    async get(u) { return rows.get(u) ?? null; },
    async putIfAbsent(u, w) { if (!rows.has(u)) rows.set(u, w); return rows.get(u)!; },
  };
}

let prevKey: string | undefined;
beforeEach(() => {
  prevKey = process.env.PII_ENCRYPTION_KEY;
  process.env.PII_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  __resetFieldCrypto();
  setDekStoreForTests(memStore());
});
afterEach(() => { process.env.PII_ENCRYPTION_KEY = prevKey; });

function fakeRest(store: Row[]) {
  const fn = (async (input: string, init?: RequestInit) => {
    const url = new URL(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    const filters = [...url.searchParams].filter(([k, v]) => k !== 'select' && v.startsWith('eq.'));
    const match = (r: Row) => filters.every(([k, v]) => String(r[k]) === v.slice(3));
    let out: Row[] = [];
    if (method === 'GET') out = store.filter(match);
    if (method === 'POST') for (const r of Array.isArray(body) ? body : [body]) (store.push({ ...r }), out.push(r));
    return new Response(JSON.stringify(out), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  return fn;
}

describe('pii access grant reason', () => {
  it('seals a new reason with the audit key and still reads an old plaintext row', async () => {
    const store: Row[] = [{ id: 'old', reason: REASON, actor_id: A }];
    const fn = withFieldDecryption(fakeRest(store));
    await fn(`${BASE}/pii_access_grants`, { method: 'POST', body: JSON.stringify({ id: 'new', actor_id: A, subject_id: S, reason: REASON }) });
    expect(String(store[1].reason)).toMatch(/^enc:v2:/);
    expect(String(store[1].reason)).not.toContain(REASON);
    expect(store[1].country).toBeUndefined();
    const res = await fn(`${BASE}/pii_access_grants?select=id,reason`, { method: 'GET' });
    const rows = await res.json() as Row[];
    expect(rows.map((r) => r.reason)).toEqual([REASON, REASON]);
  });

  it('refuses another system purpose and does not return the ciphertext or a made-up reason', async () => {
    const cipher = String((await planGrantReason(REASON) as { ciphertext: string }).ciphertext);
    await expect(decryptValue('pii_access_grants', 'reason', 'system:ops', SYSTEM_ROW, cipher)).rejects.toThrow();
    try {
      await decryptValue('pii_access_grants', 'reason', 'system:ops', SYSTEM_ROW, cipher);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      expect(message).not.toContain(REASON);
      expect(message).not.toContain(cipher);
    }
    expect(readableGrantReason(cipher)).toBeNull();
    const db = fakeDb({ results: { pii_access_grants: [[{
      id: 'g', product_id: 'nurawell', actor_id: A, subject_id: S, reason: cipher, ticket_ref: null,
      created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 60_000).toISOString(), revoked_at: null,
    }]] } });
    const grant = await liveGrant(db as never, { productId: 'nurawell', actorId: A, subjectId: S });
    expect(grant).toBeNull();
  });

  it('keeps a plaintext grant usable and omits ciphertext from the audit model', async () => {
    const plain = { id: 'g', product_id: 'nurawell', actor_id: A, subject_id: S, reason: REASON, ticket_ref: null, created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 60_000).toISOString(), revoked_at: null };
    const db = fakeDb({ results: { pii_access_grants: [[plain]] } });
    const grant = await liveGrant(db as never, { productId: 'nurawell', actorId: A, subjectId: S });
    expect(grant?.reason).toBe(REASON);

    const night = Date.parse('2026-10-25T00:30:00Z');
    const model = vi.fn(async (payload: string) => {
      expect(payload).not.toContain('enc:v2:');
      expect(payload).not.toContain(REASON);
      return [];
    });
    const auditDb = fakeDb({ results: {
      pii_access_log: [[], []],
      pii_access_grants: [[{ created_at: new Date(night).toISOString(), actor_id: A, subject_id: S, reason: `enc:v2:${'a'.repeat(40)}`, ticket_ref: null, country: 'IL', device_id: null }]],
      ops_probe_daily: [[]], ops_device_enrollments: [[]], access_audit_runs: [{ id: 'run' }],
    } });
    await runAccessAudit(auditDb as never, { model, now: night + 3600_000 });
    expect(model).not.toHaveBeenCalled();
    const update = auditDb.calls.find((c) => c.table === 'access_audit_runs' && c.op === 'update');
    const sealedErr = (update?.args[0] as { error: string }).error;
    expect(sealedErr).toMatch(/^enc:v2:/);
    expect(sealedErr).not.toContain('reason_unreadable');
    expect(JSON.stringify(update)).not.toContain(REASON);
    expect(await decryptValue('access_audit_runs', 'error', 'system:audit', SYSTEM_ROW, sealedErr)).toBe('reason_unreadable');
    await expect(decryptValue('access_audit_runs', 'error', 'system:ops', SYSTEM_ROW, sealedErr)).rejects.toThrow();
  });

  it('converts leftover plaintext in a closed batch and leaves ciphertext alone', async () => {
    const first = await planGrantReason(REASON);
    expect(first.action).toBe('write');
    if (first.action !== 'write') return;
    const table = new Map<string, string>([['a', REASON], ['b', first.ciphertext]]);
    const dry = await runGrantReasonBatch([...table].map(([id, reason]) => ({ id, reason })), async () => { throw new Error('dry'); }, false);
    expect(dry.written).toBe(0);
    expect(dry.planned).toBe(1);
    await runGrantReasonBatch([...table].map(([id, reason]) => ({ id, reason })), async (patch) => { table.set(patch.id, patch.ciphertext); }, true);
    expect(table.get('b')).toBe(first.ciphertext);
    expect(String(table.get('a'))).toMatch(/^enc:v2:/);
    const again = await runGrantReasonBatch([...table].map(([id, reason]) => ({ id, reason })), async () => { throw new Error('second'); }, true);
    expect(again.written).toBe(0);
    const bad = await runGrantReasonBatch([{ id: 'c', reason: 'short' }, { id: 'd', reason: REASON }], async () => { throw new Error('wrote'); }, true);
    expect(bad.aborted).toBe(true);
    expect(bad.written).toBe(0);
  });

  it('does not widen table privileges and does not log the reason', () => {
    const sql = readFileSync(new URL('../../../supabase/migrations/000235_pii_grant_reason_ciphertext.sql', import.meta.url), 'utf8');
    const older = readFileSync(new URL('../../../supabase/migrations/000199_pii_access_grants.sql', import.meta.url), 'utf8');
    expect(sql).not.toMatch(/^\s*grant\s|disable row level security|drop policy/im);
    expect(older).toMatch(/revoke all on public\.%I from anon, authenticated/);
    expect(sql).toMatch(/reason not like 'enc:v2:%' and char_length\(reason\) between 15 and 500/);
    const lib = readFileSync(new URL('../lib/privacy/pii-grant-reason-backfill.ts', import.meta.url), 'utf8');
    const script = readFileSync(new URL('../../../lab/scripts/backfill-pii-grant-reason.ts', import.meta.url), 'utf8');
    expect(lib).not.toMatch(/console\.(log|info|warn|error)/);
    expect(script).toMatch(/hosted databases are not a target/);
    expect(readFileSync(new URL('../app/api/v1/ops/pii-access/route.ts', import.meta.url), 'utf8')).not.toMatch(/g\.reason/);
    expect(readFileSync(new URL('../lib/security/field-backfill.ts', import.meta.url), 'utf8')).toMatch(/FIELD_V2_LOCAL_BACKFILL_ONLY/);
  });
});

describe('access audit summary length', () => {
  it('keeps 400 Hebrew characters and refuses 401 before sealing', async () => {
    const within = 'א'.repeat(400);
    const over = 'ב'.repeat(401);
    const night = Date.parse('2026-10-25T00:30:00Z');
    const grant = (subject: string) => ({ created_at: new Date(night).toISOString(), actor_id: A, subject_id: subject, reason: 'חיוב', ticket_ref: null, country: 'IL', device_id: null });
    const db = fakeDb({ results: {
      pii_access_log: [[], []],
      pii_access_grants: [[grant(S), grant(A)]],
      ops_probe_daily: [[]], ops_device_enrollments: [[]],
      access_audit_runs: [{ id: 'run' }],
      access_audit_findings: [null],
    } });
    const result = await runAccessAudit(db as never, {
      now: night + 3600_000,
      model: async () => [
        { ref: 'e1', severity: 'high', summary: within },
        { ref: 'e2', severity: 'medium', summary: over },
      ],
    });
    expect(result.findings).toBe(1);
    const inserted = db.calls.find((c) => c.table === 'access_audit_findings' && c.op === 'insert')?.args[0] as { summary: string }[];
    expect(inserted.map((row) => row.summary)).toEqual([within]);
    expect(JSON.stringify(db.calls)).not.toContain(over);
    expect(JSON.stringify(db.calls)).not.toContain('ב'.repeat(400));
    const update = db.calls.find((c) => c.table === 'access_audit_runs' && c.op === 'update')?.args[0] as { error: string; findings: number };
    expect(update.findings).toBe(1);
    expect(update.error).toMatch(/^enc:v2:/);
    expect(update.error).not.toContain('summary_too_long');
    expect(await decryptValue('access_audit_runs', 'error', 'system:audit', SYSTEM_ROW, update.error)).toBe('summary_too_long');

    const store: Row[] = [];
    const fn = withFieldDecryption(fakeRest(store));
    await fn(`${BASE}/access_audit_findings`, { method: 'POST', body: JSON.stringify({ run_id: 'run', summary: within, signals: ['odd_hours'] }) });
    const sealed = String(store[0]?.summary);
    expect(sealed.startsWith('enc:v2:')).toBe(true);
    expect(sealed.includes(within)).toBe(false);
    expect([...sealed].length).toBeLessThanOrEqual(4000);
    expect([...sealed].length).toBeGreaterThan(400);
    expect(await decryptValue('access_audit_findings', 'summary', 'system:audit', SYSTEM_ROW, sealed)).toBe(within);
  });
});
