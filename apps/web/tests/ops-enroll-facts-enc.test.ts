import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { __resetFieldCrypto, decryptValue, setDekStoreForTests, type DekStore } from '@/lib/security/field-crypto';
import type { WrappedDek } from '@/lib/security/field-envelope';
import { withFieldDecryption } from '@/lib/security/field-fetch';
import { SYSTEM_ROW } from '@/lib/security/field-registry';
import { readableEnrollFact, sealEnrollFact } from '@/lib/ops/enroll-facts';
import { planEnrollFact, runEnrollFactsBatch } from '@/lib/privacy/ops-enroll-facts-backfill';

const LABEL = 'Chrome · Mac';
const LOC = 'TLV, IL';
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

describe('ops_device_enrollments label+location', () => {
  it('seals both fields via field-fetch and rejects wrong system key', async () => {
    const store: Row[] = [{ id: 'old', label: LABEL, location: LOC }];
    const fn = withFieldDecryption((async (input: string, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      let out: Row[] = [];
      if (method === 'GET') out = store;
      if (method === 'POST') for (const r of [body]) (store.push({ ...r }), out.push(r));
      return new Response(JSON.stringify(out), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof fetch);

    await fn(`${BASE}/ops_device_enrollments`, {
      method: 'POST',
      body: JSON.stringify({ id: 'new', label: LABEL, location: LOC }),
    });
    expect(String(store[1].label)).toMatch(/^enc:v2:/);
    expect(String(store[1].location)).toMatch(/^enc:v2:/);
    expect(String(store[1].label)).not.toContain(LABEL);
    expect(String(store[1].location)).not.toContain(LOC);
    expect(readableEnrollFact(store[0].label)).toBe(LABEL);
    expect(readableEnrollFact(store[1].label)).toBe('');
    expect(await decryptValue('ops_device_enrollments', 'label', 'system:ops', SYSTEM_ROW, store[1].label)).toBe(LABEL);
    expect(await decryptValue('ops_device_enrollments', 'location', 'system:ops', SYSTEM_ROW, store[1].location)).toBe(LOC);
    await expect(decryptValue('ops_device_enrollments', 'label', 'system:audit', SYSTEM_ROW, store[1].label)).rejects.toThrow();
  });

  it('sealEnrollFact is idempotent on ciphertext', async () => {
    const once = await sealEnrollFact('label', LABEL);
    expect(once).toMatch(/^enc:v2:/);
    expect(await sealEnrollFact('label', once)).toBe(once);
    expect(await sealEnrollFact('label', '')).toBe('');
  });

  it('dry-run plans leftover plaintext then apply is idempotent', async () => {
    const first = await planEnrollFact('label', LABEL);
    expect(first.action).toBe('write');
    if (first.action !== 'write') return;
    const table = new Map<string, { label: string; location: string }>([
      ['a', { label: LABEL, location: LOC }],
      ['b', { label: first.ciphertext, location: (await planEnrollFact('location', LOC) as { action: 'write'; ciphertext: string }).ciphertext }],
    ]);
    const dry = await runEnrollFactsBatch(
      [...table].map(([id, v]) => ({ id, ...v })),
      async () => { throw new Error('dry'); },
      false,
    );
    expect(dry.written).toBe(0);
    expect(dry.planned).toBe(2);
    expect(dry.skipped).toBe(2);
    const applied = await runEnrollFactsBatch(
      [...table].map(([id, v]) => ({ id, ...v })),
      async (patch) => {
        const cur = table.get(patch.id)!;
        table.set(patch.id, { ...cur, [patch.column]: patch.ciphertext });
      },
      true,
    );
    expect(applied.written).toBe(2);
    expect(String(table.get('a')!.label)).toMatch(/^enc:v2:/);
    expect(String(table.get('a')!.location)).toMatch(/^enc:v2:/);
    const again = await runEnrollFactsBatch(
      [...table].map(([id, v]) => ({ id, ...v })),
      async () => { throw new Error('second'); },
      true,
    );
    expect(again.written).toBe(0);
    expect(again.failed).toBe(0);
  });

  it('migration does not widen privileges; writer seals', () => {
    const sql = readFileSync(new URL('../../../supabase/migrations/000244_ops_device_enroll_facts_ciphertext.sql', import.meta.url), 'utf8');
    expect(sql).not.toMatch(/^\s*grant\s|disable row level security|drop policy/im);
    expect(sql).toMatch(/label not like 'enc:v2:%' and char_length\(label\) <= 80/);
    expect(sql).toMatch(/location not like 'enc:v2:%' and char_length\(location\) <= 80/);
    const writer = readFileSync(new URL('../lib/ops/enrollment.ts', import.meta.url), 'utf8');
    expect(writer).toMatch(/sealEnrollFact\('label'/);
    expect(writer).toMatch(/sealEnrollFact\('location'/);
    expect(readFileSync(new URL('../lib/privacy/ops-enroll-facts-backfill.ts', import.meta.url), 'utf8')).not.toMatch(/console\.(log|info|warn|error)/);
  });
});
