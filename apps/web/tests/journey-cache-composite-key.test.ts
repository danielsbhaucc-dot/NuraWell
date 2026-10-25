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


import { keyColumns, rowKeyFor, rowKeyOf } from '@/lib/security/field-registry';

const T = 'journey_next_step_cache';
const rec = { step_id: R1, nudge: 'שלום', pace: 'steady' };

describe('journey_next_step_cache composite row key', () => {
  it('row key is user_id|date_key and is not blocked', () => {
    const spec = ENCRYPTED_TABLES[T as keyof typeof ENCRYPTED_TABLES];
    expect(keyColumns(spec)).toEqual(['user_id', 'date_key']);
    expect(rowKeyOf(spec, { user_id: U1, date_key: '2026-10-25' })).toBe(`${U1}|2026-10-25`);
    expect(rowKeyOf(spec, { user_id: U1 })).toBeNull();
    expect(rowKeyOf(spec, { user_id: U1, date_key: 'a|b' })).toBeNull();
    expect(() => rowKeyFor(T, { user_id: U1 })).toThrow();
    expect(`${T}.recommendation` in BLOCKED).toBe(false);
  });
  it('select planning adds both key columns', () => {
    expect(planSelect(T, 'step_id, pace, recommendation, model').added).toEqual(['user_id', 'date_key']);
  });
  it('round-trips and binds the day: a value moved to another day or user fails', async () => {
    const enc = await encryptValue(T, 'recommendation', U1, rowKeyFor(T, { user_id: U1, date_key: '2026-10-25' }), rec);
    const ok = await decryptRow(T, { user_id: U1, date_key: '2026-10-25', recommendation: enc });
    expect(ok.recommendation).toEqual(rec);
    await expect(decryptRow(T, { user_id: U1, date_key: '2026-10-26', recommendation: enc })).rejects.toBeTruthy();
    await expect(decryptRow(T, { user_id: U2, date_key: '2026-10-25', recommendation: enc })).rejects.toBeTruthy();
    await expect(decryptRow(T, { user_id: U1, recommendation: enc })).rejects.toBeInstanceOf(FieldDecryptError);
  });
  it('writer seals with the composite key', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../lib/ai/journey-adaptive-llm.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/sealRow\('journey_next_step_cache', userId, rowKeyFor\('journey_next_step_cache', \{ user_id: userId, date_key: dateKey \}\)/);
  });
});
