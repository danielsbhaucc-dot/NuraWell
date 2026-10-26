import { randomBytes } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;
const table: Row[] = [];
let raceOnce = false;

function q(rows: () => Row[]) {
  const f: Array<(r: Row) => boolean> = [];
  let patch: Row | null = null;
  let lim = 1e9;
  const api: Record<string, unknown> = {
    select: () => api,
    order: () => api,
    limit: (n: number) => ((lim = n), api),
    gt: (c: string, v: string) => (f.push((r) => String(r[c]) > v), api),
    eq: (c: string, v: unknown) => (f.push((r) => r[c] === v), api),
    is: (c: string, v: unknown) => (f.push((r) => (r[c] ?? null) === v), api),
    update: (p: Row) => ((patch = p), api),
    single: async () => ({ data: rows().find((r) => f.every((x) => x(r))) ?? null, error: null }),
    then: (res: (v: unknown) => void) => {
      let hit = rows().filter((r) => f.every((x) => x(r)));
      if (patch) {
        if (raceOnce) { raceOnce = false; hit = []; }
        for (const r of hit) Object.assign(r, patch, { updated_at: 'bumped' });
      }
      res({ data: hit.slice(0, lim).map((r) => ({ ...r })), error: null });
    },
  };
  return api;
}
vi.mock('@/lib/supabase/admin', () => ({ createRawAdminClient: () => ({ from: () => q(() => table) }) }));

import { encryptJson } from '@/lib/crypto/pii';
import { __resetFieldCrypto, decryptValue, setDekStoreForTests } from '@/lib/security/field-crypto';
import { backfillFieldV2 } from '@/lib/security/field-backfill';

const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  process.env.PII_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  __resetFieldCrypto();
  const m = new Map();
  setDekStoreForTests({ get: async (u) => m.get(u) ?? null, putIfAbsent: async (u, w) => (m.has(u) || m.set(u, w), m.get(u)) });
  table.length = 0;
});

describe('backfillFieldV2', () => {
  it('converts plaintext and v1 to v2, verifies, is idempotent, skips races', async () => {
    table.push({ user_id: U1, updated_at: 't1', goals: { a: 1 }, tags: encryptJson(['x'], U1), essentials: null });
    table.push({ user_id: U2, updated_at: 't2', goals: { b: 2 } });
    raceOnce = true; // first row's guarded update misses (concurrent write)
    const r1 = await backfillFieldV2(5000, ['user_memory_dossier']);
    expect(r1.user_memory_dossier).toMatchObject({ rows: 1, skippedRace: 1, verifyFail: 0 });
    const r2 = await backfillFieldV2(5000, ['user_memory_dossier']);
    expect(r2.user_memory_dossier).toMatchObject({ rows: 1, verifyFail: 0 });
    expect(String(table[0].goals)).toMatch(/^enc:v2:/);
    expect(await decryptValue('user_memory_dossier', 'goals', U1, U1, table[0].goals)).toEqual({ a: 1 });
    expect(await decryptValue('user_memory_dossier', 'tags', U1, U1, table[0].tags)).toEqual(['x']);
    expect(table[0].essentials).toBeNull();
    const r3 = await backfillFieldV2(5000, ['user_memory_dossier']);
    expect(r3.user_memory_dossier.rows).toBe(0);
  });
});

describe('backfillFieldV2 CAS mode (tables without updated_at)', () => {
  it('converts notifications text by compare-and-swap and verifies', async () => {
    table.push({ id: 'n1', user_id: U1, title: 'hi', body: 'plain body' });
    const r = await backfillFieldV2(5000, ['notifications']);
    expect(r.notifications).toMatchObject({ rows: 1, verifyFail: 0 });
    expect(String(table[0].body)).toMatch(/^enc:v2:/);
    expect(await decryptValue('notifications', 'body', U1, 'n1', table[0].body)).toBe('plain body');
    expect((await backfillFieldV2(5000, ['notifications'])).notifications.rows).toBe(0);
  });
});
