import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { __resetFieldCrypto, decryptValue, setDekStoreForTests, type DekStore } from '@/lib/security/field-crypto';
import type { WrappedDek } from '@/lib/security/field-envelope';
import { withFieldDecryption } from '@/lib/security/field-fetch';
import { SYSTEM_ROW } from '@/lib/security/field-registry';
import { readableRunError, sealRunError } from '@/lib/platform/access/run-error';
import { planRunError, runRunErrorBatch } from '@/lib/privacy/audit-run-error-backfill';

const ERR = 'summary_too_long';
const BASE = 'https://x.supabase.co/rest/v1';
type Row = Record<string, unknown>;

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

describe('access audit run error', () => {
  it('seals a new error via field-fetch, keeps legacy plaintext readable, hides ciphertext', async () => {
    const store: Row[] = [{ id: 'old', error: ERR }];
    const fn = withFieldDecryption((async (input: string, init?: RequestInit) => {
      const url = new URL(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      let out: Row[] = [];
      if (method === 'GET') out = store;
      if (method === 'PATCH') {
        for (const row of store) Object.assign(row, body);
        out = store;
      }
      if (method === 'POST') for (const r of [body]) (store.push({ ...r }), out.push(r));
      return new Response(JSON.stringify(out), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof fetch);

    await fn(`${BASE}/access_audit_runs?id=eq.new`, {
      method: 'POST',
      body: JSON.stringify({ id: 'new', error: ERR }),
    });
    expect(String(store[1].error)).toMatch(/^enc:v2:/);
    expect(String(store[1].error)).not.toContain(ERR);
    expect(readableRunError(store[0].error)).toBe(ERR);
    expect(readableRunError(store[1].error)).toBeNull();
    expect(await decryptValue('access_audit_runs', 'error', 'system:audit', SYSTEM_ROW, store[1].error)).toBe(ERR);
    await expect(decryptValue('access_audit_runs', 'error', 'system:ops', SYSTEM_ROW, store[1].error)).rejects.toThrow();
  });

  it('sealRunError is idempotent on ciphertext and refuses to echo plaintext', async () => {
    const once = await sealRunError(ERR);
    expect(once).toMatch(/^enc:v2:/);
    expect(once).not.toContain(ERR);
    expect(await sealRunError(once)).toBe(once);
    expect(await sealRunError(null)).toBeNull();
    expect(await sealRunError('')).toBeNull();
  });

  it('dry-run plans one rewrite and apply writes once; second pass is a no-op', async () => {
    const first = await planRunError(ERR);
    expect(first.action).toBe('write');
    if (first.action !== 'write') return;
    const table = new Map<string, string>([['a', ERR], ['b', first.ciphertext]]);
    const dry = await runRunErrorBatch([...table].map(([id, error]) => ({ id, error })), async () => { throw new Error('dry'); }, false);
    expect(dry.written).toBe(0);
    expect(dry.planned).toBe(1);
    expect(dry.skipped).toBe(1);
    const applied = await runRunErrorBatch([...table].map(([id, error]) => ({ id, error })), async (patch) => { table.set(patch.id, patch.ciphertext); }, true);
    expect(applied.written).toBe(1);
    expect(String(table.get('a'))).toMatch(/^enc:v2:/);
    expect(table.get('b')).toBe(first.ciphertext);
    const again = await runRunErrorBatch([...table].map(([id, error]) => ({ id, error })), async () => { throw new Error('second'); }, true);
    expect(again.written).toBe(0);
    expect(again.failed).toBe(0);
  });

  it('rejects overlong plaintext in the plan and does not widen privileges', async () => {
    expect(await planRunError('x'.repeat(121))).toEqual({ action: 'fail' });
    const sql = readFileSync(new URL('../../../supabase/migrations/000242_access_audit_run_error_ciphertext.sql', import.meta.url), 'utf8');
    expect(sql).not.toMatch(/^\s*grant\s|disable row level security|drop policy/im);
    expect(sql).toMatch(/error not like 'enc:v2:%' and char_length\(error\) <= 120/);
    expect(sql).toMatch(/error like 'enc:v2:%' and char_length\(error\) <= 4000/);
    const job = readFileSync(new URL('../lib/platform/access/audit-job.ts', import.meta.url), 'utf8');
    expect(job).toMatch(/sealRunError/);
    expect(readFileSync(new URL('../lib/privacy/audit-run-error-backfill.ts', import.meta.url), 'utf8')).not.toMatch(/console\.(log|info|warn|error)/);
  });
});
