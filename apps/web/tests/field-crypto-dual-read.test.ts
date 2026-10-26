import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  __resetFieldCrypto,
  decryptRow,
  encryptValue,
  FieldDecryptError,
  setDekStoreForTests,
  type DekStore,
} from '@/lib/security/field-crypto';
import type { WrappedDek } from '@/lib/security/field-envelope';
import { planSelect, tableFromUrl, withFieldDecryption } from '@/lib/security/field-fetch';
import { BLOCKED, ENCRYPTED_TABLES } from '@/lib/security/field-registry';

const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';
const R1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const R2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function memStore(): DekStore & { rows: Map<string, WrappedDek> } {
  const rows = new Map<string, WrappedDek>();
  return {
    rows,
    async get(u) {
      return rows.get(u) ?? null;
    },
    async putIfAbsent(u, w) {
      if (!rows.has(u)) rows.set(u, w);
      return rows.get(u)!;
    },
  };
}

let prevKey: string | undefined;
beforeEach(() => {
  prevKey = process.env.PII_ENCRYPTION_KEY;
  process.env.PII_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  __resetFieldCrypto();
  setDekStoreForTests(memStore());
});
afterEach(() => {
  process.env.PII_ENCRYPTION_KEY = prevKey;
  __resetFieldCrypto();
});

describe('field registry', () => {
  it('every table has owner + row key and only known kinds', () => {
    for (const [t, spec] of Object.entries(ENCRYPTED_TABLES)) {
      const sys = (spec as { system?: string }).system;
      if (sys) expect(['audit', 'ops', 'legal'], t).toContain(sys);
      else expect(spec.userCol, t).toBeTruthy();
      expect(spec.rowCol, t).toBeTruthy();
      for (const k of Object.values(spec.columns)) expect(['text', 'json', 'text[]']).toContain(k);
    }
  });
  it('blocked entries point at registered columns', () => {
    const reg = ENCRYPTED_TABLES as Record<string, { columns: Record<string, string> }>;
    for (const key of Object.keys(BLOCKED)) {
      const [t, c] = key.split('.');
      expect(reg[t]?.columns[c], key).toBeTruthy();
    }
  });
});

describe('AAD binding (user + table.column + row)', () => {
  it('round-trips text and json', async () => {
    const enc = await encryptValue('notifications', 'body', U1, R1, 'שלום');
    expect(String(enc)).toMatch(/^enc:v2:/);
    const row = await decryptRow('notifications', { id: R1, user_id: U1, body: enc, title: 'plain' });
    expect(row).toMatchObject({ body: 'שלום', title: 'plain' });
    const j = await encryptValue('journey_progress', 'quiz_answers', U1, R1, { a: [1, 'ב'] });
    expect((await decryptRow('journey_progress', { id: R1, user_id: U1, quiz_answers: j })).quiz_answers).toEqual({ a: [1, 'ב'] });
  });
  it('rejects a value moved to another row, column or user', async () => {
    const enc = await encryptValue('notifications', 'body', U1, R1, 'secret');
    await expect(decryptRow('notifications', { id: R2, user_id: U1, body: enc })).rejects.toThrow();
    await expect(decryptRow('notifications', { id: R1, user_id: U1, title: enc })).rejects.toThrow();
    await encryptValue('notifications', 'body', U2, R1, 'x'); // U2 gets a DEK
    await expect(decryptRow('notifications', { id: R1, user_id: U2, body: enc })).rejects.toThrow();
  });
  it('passes plaintext and enc:v1 through (dual read)', async () => {
    const row = { id: R1, user_id: U1, body: 'plain', title: 'enc:v1:abc' };
    expect(await decryptRow('notifications', row)).toEqual(row);
  });
  it('needs owner and row key to decrypt', async () => {
    const enc = await encryptValue('notifications', 'body', U1, R1, 'x');
    await expect(decryptRow('notifications', { body: enc })).rejects.toBeInstanceOf(FieldDecryptError);
  });
  it('text[] elements are bound to their index', async () => {
    const arr = (await encryptValue('user_mentorship_strategy', 'current_focus', U1, U1, ['a', 'b'])) as string[];
    const row = await decryptRow('user_mentorship_strategy', { user_id: U1, current_focus: arr });
    expect(row.current_focus).toEqual(['a', 'b']);
    await expect(decryptRow('user_mentorship_strategy', { user_id: U1, current_focus: [arr[1], arr[0]] })).rejects.toThrow();
  });
});

describe('fetch wrapper', () => {
  it('adds owner/row columns to narrow selects and strips them again', async () => {
    expect(planSelect('notifications', 'title,body')).toEqual({ select: 'title,body,user_id,id', added: ['user_id', 'id'] });
    expect(planSelect('notifications', '*').added).toEqual([]);
    expect(planSelect('notifications', 'id,user_id,body').added).toEqual([]);
    expect(planSelect('notifications', 'count()').added).toEqual([]);
    expect(planSelect('profiles', 'full_name').select).toBe('full_name,id');
    expect(planSelect('unregistered_table', 'a').added).toEqual([]);
    expect(tableFromUrl(new URL('https://x.supabase.co/rest/v1/notifications?select=*'))).toBe('notifications');
  });

  it('decrypts responses end to end and leaves other tables alone', async () => {
    const enc = await encryptValue('notifications', 'body', U1, R1, 'גוף');
    let seen = '';
    const base = (async (input: RequestInfo | URL) => {
      seen = String(input);
      const sel = new URL(seen).searchParams.get('select');
      const row: Record<string, unknown> = { title: 't', body: enc };
      if (sel?.includes('user_id')) row.user_id = U1;
      if (sel?.includes('id')) row.id = R1;
      return new Response(JSON.stringify([row]), { headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
    const f = withFieldDecryption(base);
    const res = await f('https://x.supabase.co/rest/v1/notifications?select=title,body', { method: 'GET' });
    expect(new URL(seen).searchParams.get('select')).toBe('title,body,user_id,id');
    expect(await res.json()).toEqual([{ title: 't', body: 'גוף' }]);

    const other = await f('https://x.supabase.co/rest/v1/site_settings?select=a', { method: 'GET' });
    expect(new URL(seen).searchParams.get('select')).toBe('a');
    expect(await other.json()).toEqual([{ title: 't', body: enc }]);
  });
});
