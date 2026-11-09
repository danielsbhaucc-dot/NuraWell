import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { __resetFieldCrypto, decryptValue, setDekStoreForTests, type DekStore } from '@/lib/security/field-crypto';
import type { WrappedDek } from '@/lib/security/field-envelope';
import { withFieldDecryption } from '@/lib/security/field-fetch';
import { SYSTEM_ROW, APPEND_ONLY_TABLES, ENCRYPTED_TABLES } from '@/lib/security/field-registry';
import { sealLogCountry, sealLogResource } from '@/lib/platform/access/log-fields';
import { readableFindingSignals, sealFindingSignals } from '@/lib/platform/access/finding-signals';
import { planSignals, runSignalsBatch } from '@/lib/privacy/audit-signals-backfill';
import { requirePiiGrant } from '@/lib/platform/access/pii-access';
import { fakeDb } from './helpers/access-fake-db';

const A = '11111111-1111-4111-8111-111111111111';
const S = '22222222-2222-4222-8222-222222222222';
const BASE = 'https://x.supabase.co/rest/v1';
const SIGS = ['odd_hours', 'new_country'];

function memStore(): DekStore {
  const rows = new Map<string, WrappedDek>();
  return {
    async get(u) { return rows.get(u) ?? null; },
    async putIfAbsent(u, w) { if (!rows.has(u)) rows.set(u, w); return rows.get(u)!; },
  };
}

let prev: string | undefined;
beforeEach(() => {
  prev = process.env.PII_ENCRYPTION_KEY;
  process.env.PII_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  __resetFieldCrypto();
  setDekStoreForTests(memStore());
});
afterEach(() => { process.env.PII_ENCRYPTION_KEY = prev; });

describe('pii_access_log country+resource (append-only)', () => {
  it('is append-only in registry and seals on requirePiiGrant denied log', async () => {
    expect(APPEND_ONLY_TABLES.pii_access_log).toBeTruthy();
    expect(ENCRYPTED_TABLES.pii_access_log.columns).toMatchObject({ country: 'text', resource: 'text' });
    const db = fakeDb({ results: { pii_access_grants: [[]] } });
    const req = new Request('https://x', { headers: { 'x-vercel-ip-country': 'IL' } });
    await requirePiiGrant(db as never, req, { productId: 'nurawell', actorId: A, subjectId: S, resource: 'profile.dob' });
    const row = db.calls.find((c) => c.table === 'pii_access_log' && c.op === 'insert')?.args[0] as { country: string; resource: string; event: string };
    expect(row.event).toBe('denied');
    expect(row.country).toMatch(/^enc:v2:/);
    expect(row.resource).toMatch(/^enc:v2:/);
    expect(row.country).not.toBe('IL');
    expect(row.resource).not.toContain('profile');
    expect(await decryptValue('pii_access_log', 'country', 'system:audit', SYSTEM_ROW, row.country)).toBe('IL');
    expect(await decryptValue('pii_access_log', 'resource', 'system:audit', SYSTEM_ROW, row.resource)).toBe('profile.dob');
    await expect(decryptValue('pii_access_log', 'country', 'system:ops', SYSTEM_ROW, row.country)).rejects.toThrow();
  });

  it('migration allows enc:v2 and does not widen privileges; seal helpers idempotent', async () => {
    const sql = readFileSync(new URL('../../../supabase/migrations/000248_pii_access_log_ciphertext.sql', import.meta.url), 'utf8');
    expect(sql).not.toMatch(/^\s*grant\s|disable row level security|drop policy/im);
    expect(sql).toMatch(/trg_pii_access_log_immutable|Append-only|append-only/);
    const c = await sealLogCountry('IL');
    expect(await sealLogCountry(c)).toBe(c);
    expect(await sealLogResource('')).toBe('');
  });
});

describe('access_audit_findings.signals text[]', () => {
  it('seals per-element via field-fetch and preserves array length', async () => {
    const store: Record<string, unknown>[] = [{ id: 'old', signals: SIGS, summary: 'x' }];
    const fn = withFieldDecryption((async (_input: string, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      let out: Record<string, unknown>[] = [];
      if (method === 'GET') out = store;
      if (method === 'POST') for (const r of [body]) (store.push({ ...r }), out.push(r));
      return new Response(JSON.stringify(out), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof fetch);
    await fn(`${BASE}/access_audit_findings`, { method: 'POST', body: JSON.stringify({ id: 'new', signals: SIGS, summary: 'x' }) });
    const sealed = store[1].signals as string[];
    expect(Array.isArray(sealed)).toBe(true);
    expect(sealed).toHaveLength(2);
    expect(sealed.every((s) => s.startsWith('enc:v2:'))).toBe(true);
    expect(readableFindingSignals(SIGS)).toEqual(SIGS);
    expect(readableFindingSignals(sealed)).toEqual([]);
    expect(await decryptValue('access_audit_findings', 'signals', 'system:audit', SYSTEM_ROW, sealed)).toEqual(SIGS);
    await expect(decryptValue('access_audit_findings', 'signals', 'system:ops', SYSTEM_ROW, sealed)).rejects.toThrow();
  });

  it('backfill dry-run/apply/idempotent; refuses invalid codes', async () => {
    const first = await planSignals(SIGS);
    expect(first.action).toBe('write');
    if (first.action !== 'write') return;
    const table = new Map<string, string[]>([['a', SIGS], ['b', first.ciphertext]]);
    const dry = await runSignalsBatch([...table].map(([id, signals]) => ({ id, signals })), async () => { throw new Error('dry'); }, false);
    expect(dry.planned).toBe(1);
    expect(dry.skipped).toBe(1);
    const applied = await runSignalsBatch([...table].map(([id, signals]) => ({ id, signals })), async (patch) => { table.set(patch.id, patch.ciphertext); }, true);
    expect(applied.written).toBe(1);
    const again = await runSignalsBatch([...table].map(([id, signals]) => ({ id, signals })), async () => { throw new Error('second'); }, true);
    expect(again.written).toBe(0);
    expect(await planSignals(['Odd Hours'])).toEqual({ action: 'fail' });
    expect(await sealFindingSignals(SIGS)).toHaveLength(2);
  });
});
