import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { __resetFieldCrypto, decryptValue, setDekStoreForTests, type DekStore } from '@/lib/security/field-crypto';
import type { WrappedDek } from '@/lib/security/field-envelope';
import { withFieldDecryption } from '@/lib/security/field-fetch';
import { SYSTEM_ROW } from '@/lib/security/field-registry';
import { readableCountry, readableTicketRef, sealGrantCountry, sealTicketRef } from '@/lib/platform/access/grant-fields';
import { planGrantField, runGrantFieldsBatch } from '@/lib/privacy/pii-grant-fields-backfill';
import { createPiiGrant } from '@/lib/platform/access/pii-access';
import { fakeDb } from './helpers/access-fake-db';

const TICKET = 'TCK-42';
const COUNTRY = 'IL';
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

let prev: string | undefined;
beforeEach(() => {
  prev = process.env.PII_ENCRYPTION_KEY;
  process.env.PII_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  __resetFieldCrypto();
  setDekStoreForTests(memStore());
});
afterEach(() => { process.env.PII_ENCRYPTION_KEY = prev; });

describe('pii_access_grants ticket_ref + country', () => {
  it('seals both via field-fetch; wrong key rejects; legacy readable', async () => {
    const store: Row[] = [{ id: 'old', ticket_ref: TICKET, country: COUNTRY, reason: REASON }];
    const fn = withFieldDecryption((async (input: string, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      let out: Row[] = [];
      if (method === 'GET') out = store;
      if (method === 'POST') for (const r of [body]) (store.push({ ...r }), out.push(r));
      return new Response(JSON.stringify(out), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof fetch);

    await fn(`${BASE}/pii_access_grants`, {
      method: 'POST',
      body: JSON.stringify({ id: 'new', ticket_ref: TICKET, country: COUNTRY, reason: REASON }),
    });
    expect(String(store[1].ticket_ref)).toMatch(/^enc:v2:/);
    expect(String(store[1].country)).toMatch(/^enc:v2:/);
    expect(String(store[1].ticket_ref)).not.toContain(TICKET);
    expect(String(store[1].country)).not.toContain(COUNTRY);
    expect(readableTicketRef(store[0].ticket_ref)).toBe(TICKET);
    expect(readableTicketRef(store[1].ticket_ref)).toBeNull();
    expect(readableCountry(store[1].country)).toBeNull();
    expect(await decryptValue('pii_access_grants', 'ticket_ref', 'system:audit', SYSTEM_ROW, store[1].ticket_ref)).toBe(TICKET);
    expect(await decryptValue('pii_access_grants', 'country', 'system:audit', SYSTEM_ROW, store[1].country)).toBe(COUNTRY);
    await expect(decryptValue('pii_access_grants', 'ticket_ref', 'system:ops', SYSTEM_ROW, store[1].ticket_ref)).rejects.toThrow();
  });

  it('createPiiGrant writes sealed ticket_ref and country', async () => {
    const db = fakeDb({ results: { pii_access_grants: [{ id: 'g1', expires_at: new Date(Date.now() + 60_000).toISOString() }], pii_access_log: [null] } });
    const req = new Request('https://x/local', { headers: { 'x-vercel-ip-country': 'IL' } });
    const r = await createPiiGrant(db as never, req, { productId: 'nurawell', actorId: A, subjectId: S, reason: REASON, ticketRef: TICKET });
    expect(r.ok).toBe(true);
    const insert = db.calls.find((c) => c.table === 'pii_access_grants' && c.op === 'insert')?.args[0] as { ticket_ref: string; country: string; reason: string };
    expect(insert.ticket_ref).toMatch(/^enc:v2:/);
    expect(insert.country).toMatch(/^enc:v2:/);
    expect(insert.ticket_ref).not.toContain(TICKET);
    expect(insert.country).not.toBe('IL');
    expect(await decryptValue('pii_access_grants', 'ticket_ref', 'system:audit', SYSTEM_ROW, insert.ticket_ref)).toBe(TICKET);
    expect(await decryptValue('pii_access_grants', 'country', 'system:audit', SYSTEM_ROW, insert.country)).toBe('IL');
  });

  it('backfill dry-run then apply is idempotent', async () => {
    const first = await planGrantField('ticket_ref', TICKET);
    expect(first.action).toBe('write');
    if (first.action !== 'write') return;
    const cFirst = await planGrantField('country', COUNTRY);
    expect(cFirst.action).toBe('write');
    if (cFirst.action !== 'write') return;
    const table = new Map<string, { ticket_ref: string; country: string }>([
      ['a', { ticket_ref: TICKET, country: COUNTRY }],
      ['b', { ticket_ref: first.ciphertext, country: cFirst.ciphertext }],
    ]);
    const dry = await runGrantFieldsBatch([...table].map(([id, v]) => ({ id, ...v })), async () => { throw new Error('dry'); }, false);
    expect(dry.written).toBe(0);
    expect(dry.planned).toBe(2);
    expect(dry.skipped).toBe(2);
    const applied = await runGrantFieldsBatch([...table].map(([id, v]) => ({ id, ...v })), async (patch) => {
      const cur = table.get(patch.id)!;
      table.set(patch.id, { ...cur, [patch.column]: patch.ciphertext });
    }, true);
    expect(applied.written).toBe(2);
    expect(String(table.get('a')!.ticket_ref)).toMatch(/^enc:v2:/);
    expect(String(table.get('a')!.country)).toMatch(/^enc:v2:/);
    const again = await runGrantFieldsBatch([...table].map(([id, v]) => ({ id, ...v })), async () => { throw new Error('second'); }, true);
    expect(again.written).toBe(0);
    expect(again.failed).toBe(0);
  });

  it('migration keeps legacy regex and enc:v2; no privilege widen; seal helpers idempotent', async () => {
    const sql = readFileSync(new URL('../../../supabase/migrations/000246_pii_grant_ticket_country_ciphertext.sql', import.meta.url), 'utf8');
    expect(sql).not.toMatch(/^\s*grant\s|disable row level security|drop policy/im);
    expect(sql).toMatch(/ticket_ref ~ '\^\[A-Za-z0-9#\._-\]\{2,40\}\$'/);
    expect(sql).toMatch(/country not like 'enc:v2:%' and char_length\(country\) <= 2/);
    const once = await sealTicketRef(TICKET);
    expect(await sealTicketRef(once)).toBe(once);
    expect(await sealGrantCountry(null)).toBeNull();
    expect(await planGrantField('ticket_ref', 'x'.repeat(41))).toEqual({ action: 'fail' });
    expect(await planGrantField('country', 'ISR')).toEqual({ action: 'fail' });
    expect(readFileSync(new URL('../lib/privacy/pii-grant-fields-backfill.ts', import.meta.url), 'utf8')).not.toMatch(/console\.(log|info|warn|error)/);
  });
});
