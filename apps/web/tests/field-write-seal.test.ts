import { randomBytes } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { __resetFieldCrypto, decryptValue, setDekStoreForTests } from '@/lib/security/field-crypto';
import { withFieldDecryption } from '@/lib/security/field-fetch';
import { FIELD_V2_TABLES, ENCRYPTED_TABLES, isBlocked } from '@/lib/security/field-registry';
import { FIELD_V2_BACKFILL_TABLES } from '@/lib/security/field-backfill';
import { dedupeNormalize, notificationDedupeKey } from '@/lib/security/field-write';

const U1 = '11111111-1111-4111-8111-111111111111';
const R1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BASE = 'https://x.supabase.co/rest/v1';
type Row = Record<string, unknown>;

beforeEach(() => {
  process.env.PII_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  __resetFieldCrypto();
  const m = new Map();
  setDekStoreForTests({ get: async (u) => m.get(u) ?? null, putIfAbsent: async (u, w) => (m.has(u) || m.set(u, w), m.get(u)) });
});

/** tiny in-memory PostgREST: GET filters by eq., POST inserts, PATCH updates; echoes representation */
function fakeRest(store: Row[]) {
  const calls: Array<{ method: string; url: string; body?: unknown }> = [];
  const fn = (async (input: string, init?: RequestInit) => {
    const url = new URL(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ method, url: url.toString(), body });
    const filters = [...url.searchParams].filter(([k, v]) => k !== 'select' && k !== 'on_conflict' && v.startsWith('eq.'));
    const match = (r: Row) => filters.every(([k, v]) => String(r[k]) === v.slice(3));
    let out: Row[] = [];
    if (method === 'GET') out = store.filter(match);
    if (method === 'POST') for (const r of Array.isArray(body) ? body : [body]) (store.push({ ...r }), out.push(r));
    if (method === 'PATCH') for (const r of store.filter(match)) (Object.assign(r, body), out.push({ ...r }));
    return new Response(JSON.stringify(out), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

describe('write sealing (server fetch wrapper)', () => {
  it('insert seals registered columns as v2 with a stable row id and returns plaintext', async () => {
    const store: Row[] = [];
    const { fn } = fakeRest(store);
    const res = await withFieldDecryption(fn)(`${BASE}/notifications?select=*`, {
      method: 'POST', headers: { prefer: 'return=representation' },
      body: JSON.stringify({ user_id: U1, source: 'x', title: 'שלום דני', body: 'גוף ההודעה', type: 'system' }),
    });
    const [stored] = store;
    expect(typeof stored.id).toBe('string');
    expect(String(stored.title)).toMatch(/^enc:v2:/);
    expect(String(stored.body)).toMatch(/^enc:v2:/);
    expect(stored.dedupe_key).toBe(notificationDedupeKey({ source: 'x', title: 'שלום דני', body: 'גוף ההודעה' }));
    expect(await decryptValue('notifications', 'body', U1, stored.id as string, stored.body)).toBe('גוף ההודעה');
    const back = (await res.json()) as Row[];
    expect(back[0]).toMatchObject({ title: 'שלום דני', body: 'גוף ההודעה' });
  });

  it('update seals per row and round-trips; blocked columns stay plaintext', async () => {
    const store: Row[] = [{ id: R1, user_id: U1, body: 'old', metadata: { source: 'a' } }];
    const { fn } = fakeRest(store);
    await withFieldDecryption(fn)(`${BASE}/notifications?id=eq.${R1}`, {
      method: 'PATCH', body: JSON.stringify({ body: 'new text', metadata: { source: 'b' } }),
    });
    expect(String(store[0].body)).toMatch(/^enc:v2:/);
    expect(store[0].metadata).toEqual({ source: 'b' }); // notifications.metadata is BLOCKED
    expect(await decryptValue('notifications', 'body', U1, R1, store[0].body)).toBe('new text');
    const res = await withFieldDecryption(fn)(`${BASE}/notifications?select=body&id=eq.${R1}`, { method: 'GET' });
    expect(((await res.json()) as Row[])[0].body).toBe('new text');
  });

  it('json columns round-trip', async () => {
    const store: Row[] = [];
    const { fn } = fakeRest(store);
    await withFieldDecryption(fn)(`${BASE}/journey_progress`, { method: 'POST', body: JSON.stringify({ id: R1, user_id: U1, step_id: 's', quiz_answers: { q1: 'א' } }) });
    expect(String(store[0].quiz_answers)).toMatch(/^enc:v2:/);
    expect(await decryptValue('journey_progress', 'quiz_answers', U1, R1, store[0].quiz_answers)).toEqual({ q1: 'א' });
  });

  it('every registered table with an unblocked column is live and in the backfill list', () => {
    for (const [t, spec] of Object.entries(ENCRYPTED_TABLES)) {
      const live = Object.keys(spec.columns).some((c) => !isBlocked(t, c));
      expect(FIELD_V2_TABLES.includes(t), t).toBe(live);
    }
    expect(FIELD_V2_BACKFILL_TABLES).toEqual(FIELD_V2_TABLES);
    expect(FIELD_V2_TABLES).toContain('pending_almog_commitment_jobs');
  });

  it('dedupe normalisation matches the SQL function', () => {
    expect(dedupeNormalize('  Hello,   WORLD!! שלום ')).toBe('hello world שלום');
  });
});
