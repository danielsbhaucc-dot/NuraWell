import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { plaintextGuardLines } from '@/lib/security/plaintext-guard-list';
import { ENCRYPTED_TABLES, FIELD_V2_BACKFILL_COMPLETE, FIELD_V2_TABLES } from '@/lib/security/field-registry';

describe('backup plaintext guard column list', () => {
  it('matches field-registry + column-classification (regenerate with scripts/gen-plaintext-guard.mts)', () => {
    const got = readFileSync(join(__dirname, '../../../scripts/backup/encrypted-columns.txt'), 'utf8')
      .split('\n').filter((l) => l && !l.startsWith('#'));
    expect(got).toEqual(plaintextGuardLines());
  });
  it('completed tables are a subset of the live v2 tables', () => {
    for (const t of FIELD_V2_BACKFILL_COMPLETE) expect(FIELD_V2_TABLES).toContain(t);
  });
  it('ownerOptional tables exempt only ownerless catalog rows; every other enforce line has no owner filter', () => {
    for (const l of plaintextGuardLines().filter((x) => /^(enforce|pending) /.test(x))) {
      const [, t, , , extra] = l.split(' ');
      const spec = (ENCRYPTED_TABLES as Record<string, { userCol: string; ownerOptional?: boolean }>)[t];
      if (extra?.startsWith('refs:')) continue; // CHAINED_TABLES (checked in enc-reject-triggers.test.ts)
      expect(extra).toBe(spec.ownerOptional ? `owner:${spec.userCol}` : undefined);
    }
  });
});
