import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { __resetFieldCrypto, setDekStoreForTests, type DekStore } from '@/lib/security/field-crypto';
import type { WrappedDek } from '@/lib/security/field-envelope';
import { planBirthRestore, planBirthValue, runBirthBatch, type BirthWrite } from '@/lib/privacy/birth-date-backfill';

const U = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';

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

describe('birth date backfill', () => {
  it('encrypts only leftover ISO dates after a decrypt check, and restores dummy data', async () => {
    const first = await planBirthValue('date_of_birth', '1990-05-04', U, U);
    expect(first.action).toBe('write');
    if (first.action !== 'write') return;
    expect(first.ciphertext.startsWith('enc:v2:')).toBe(true);
    expect(first.ciphertext).not.toContain('1990-05-04');
    expect((await planBirthValue('date_of_birth', first.ciphertext, U, U)).action).toBe('skip');
    expect((await planBirthValue('date_of_birth', null, U, U)).action).toBe('skip');
    expect((await planBirthValue('date_of_birth', 'not-a-date', U, U)).action).toBe('fail');

    const table = new Map<string, { date_of_birth: unknown; birth_date: unknown }>([
      [U, { date_of_birth: '1990-05-04', birth_date: null }],
      [U2, { date_of_birth: first.ciphertext, birth_date: '1981-02-03' }],
    ]);
    const writes: BirthWrite[] = [];
    const dry = await runBirthBatch(
      [...table].map(([id, row]) => ({ id, ...row })),
      async (patch) => { writes.push(patch); },
      false,
    );
    expect(dry.written).toBe(0);
    expect(writes).toHaveLength(0);
    expect(dry.planned).toBe(2);

    const applied = await runBirthBatch(
      [...table].map(([id, row]) => ({ id, ...row })),
      async (patch) => { table.get(patch.id)![patch.column] = patch.ciphertext; },
      true,
    );
    expect(applied.written).toBe(2);
    expect(String(table.get(U)?.date_of_birth)).toMatch(/^enc:v2:/);
    expect(String(table.get(U2)?.date_of_birth)).toBe(first.ciphertext);
    const again = await runBirthBatch(
      [...table].map(([id, row]) => ({ id, ...row })),
      async () => { throw new Error('second pass must not write'); },
      true,
    );
    expect(again.written).toBe(0);
    expect(again.failed).toBe(0);

    const restored = await planBirthRestore('date_of_birth', table.get(U)?.date_of_birth, U, U);
    expect(restored).toEqual({ action: 'restore', plain: '1990-05-04' });
    expect((await planBirthRestore('date_of_birth', '1990-05-04', U, U)).action).toBe('skip');
  });

  it('writes nothing from a batch that contains a value it cannot seal', async () => {
    const writes: string[] = [];
    const result = await runBirthBatch(
      [
        { id: U, date_of_birth: '1990-05-04', birth_date: null },
        { id: U2, date_of_birth: '1990/05/04', birth_date: null },
      ],
      async () => { writes.push('wrote'); },
      true,
    );
    expect(result.aborted).toBe(true);
    expect(result.written).toBe(0);
    expect(writes).toHaveLength(0);
  });

  it('keeps the procedure off hosted databases and away from plaintext logs', () => {
    const script = readFileSync(new URL('../scripts/backfill-birth-dates.ts', import.meta.url), 'utf8');
    const lib = readFileSync(new URL('../lib/privacy/birth-date-backfill.ts', import.meta.url), 'utf8');
    expect(script).toMatch(/hosted databases are not a target/);
    expect(script).toContain('127\\.0\\.0\\.1|localhost');
    expect(script).not.toMatch(/DISABLE ROW LEVEL SECURITY|DROP COLUMN|DELETE FROM|TRUNCATE/i);
    expect(lib).not.toMatch(/console\.(log|info|warn|error)/);
    expect(script).toMatch(/!~ '\^enc:v2:'/);
  });
});
