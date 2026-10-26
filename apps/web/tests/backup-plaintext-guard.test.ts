import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ENCRYPTED_TABLES, isBlocked } from '@/lib/security/field-registry';
import { FIELD_V2_BACKFILL_TABLES } from '@/lib/security/field-backfill';

describe('backup plaintext guard column list', () => {
  it('matches field-registry + FIELD_V2_BACKFILL_TABLES', () => {
    const want: string[] = [];
    for (const [t, v] of Object.entries(ENCRYPTED_TABLES))
      for (const [c, k] of Object.entries((v as { columns: Record<string, string> }).columns))
        if (!isBlocked(t, c)) want.push(`${FIELD_V2_BACKFILL_TABLES.includes(t) ? 'enforce' : 'pending'} ${t} ${c} ${k}`);
    const got = readFileSync(join(__dirname, '../../../scripts/backup/encrypted-columns.txt'), 'utf8')
      .split('\n').filter((l) => l && !l.startsWith('#'));
    expect(got).toEqual(want);
  });
});
