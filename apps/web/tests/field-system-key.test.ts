import { randomBytes } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { __resetFieldCrypto, decryptValue, encryptValue, setDekStoreForTests, systemDek } from '@/lib/security/field-crypto';
import { withFieldDecryption } from '@/lib/security/field-fetch';
import { aadColumns, ENCRYPTED_TABLES, ownerOf, rowKeyOf, SYSTEM_ROW, type EncryptedTable } from '@/lib/security/field-registry';

const BASE = 'https://x.supabase.co/rest/v1';
type Row = Record<string, unknown>;
const stored: string[] = [];

beforeEach(() => {
  process.env.PII_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  __resetFieldCrypto();
  stored.length = 0;
  // the system key must never touch user_data_keys
  setDekStoreForTests({ get: async (u) => (stored.push(u), null), putIfAbsent: async (u) => { stored.push(u); throw new Error('no'); } });
});

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
    if (method === 'PATCH') for (const r of store.filter(match)) (Object.assign(r, body), out.push({ ...r }));
    return new Response(JSON.stringify(out), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  return fn;
}

describe('system-owned encrypted tables', () => {
  it('purposes get independent keys, derived (not stored)', () => {
    const a = systemDek('system:audit');
    const o = systemDek('system:ops');
    const l = systemDek('system:legal');
    expect(a.equals(o) || a.equals(l) || o.equals(l)).toBe(false);
    expect(systemDek('system:audit').equals(a)).toBe(true);
    expect(() => systemDek('system:other')).toThrow();
  });

  it('row key is constant, no read key columns needed', () => {
    const spec = ENCRYPTED_TABLES.error_events as EncryptedTable;
    expect(rowKeyOf(spec, {})).toBe(SYSTEM_ROW);
    expect(ownerOf(spec, {})).toBe('system:audit');
    expect(aadColumns(spec)).toEqual([]);
  });

  it('insert without id (bigint identity) seals, update seals once, reads decrypt', async () => {
    const store: Row[] = [];
    const fn = withFieldDecryption(fakeRest(store));
    await fn(`${BASE}/error_events`, { method: 'POST', body: JSON.stringify({ source: 'api', stack: 'at x (a.ts:1)', tags: { route: '/x' } }) });
    expect(store[0].id).toBeUndefined();
    expect(String(store[0].stack)).toMatch(/^enc:v2:/);
    expect(String(store[0].tags)).toMatch(/^enc:v2:/);
    store[0].id = 7;
    await fn(`${BASE}/error_events?source=eq.api`, { method: 'PATCH', body: JSON.stringify({ stack: 'new' }) });
    expect(String(store[0].stack)).toMatch(/^enc:v2:/);
    const res = await fn(`${BASE}/error_events?select=stack,tags&id=eq.7`, { method: 'GET' });
    expect(((await res.json()) as Row[])[0]).toMatchObject({ stack: 'new', tags: { route: '/x' } });
    expect(stored).toEqual([]);
  });

  it('a system ciphertext cannot be read under another purpose or column', async () => {
    const v = await encryptValue('error_events', 'stack', 'system:audit', SYSTEM_ROW, 'secret');
    expect(await decryptValue('error_events', 'stack', 'system:audit', SYSTEM_ROW, v)).toBe('secret');
    await expect(decryptValue('error_events', 'stack', 'system:ops', SYSTEM_ROW, v)).rejects.toThrow();
    await expect(decryptValue('error_events', 'tags', 'system:audit', SYSTEM_ROW, v)).rejects.toThrow();
  });
});
