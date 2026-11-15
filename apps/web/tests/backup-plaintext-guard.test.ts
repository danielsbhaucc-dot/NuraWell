import { readdirSync, readFileSync } from 'node:fs';
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
  it('append lines filter on a row-time column the table really has (backup job failed 2026-11-13..15 on pii_access_log.at)', () => {
    const dir = join(__dirname, '../../../supabase/migrations');
    const sql = readdirSync(dir).filter((f) => f.endsWith('.sql')).map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
    for (const l of plaintextGuardLines().filter((x) => x.startsWith('append '))) {
      const [, t, , , ts] = l.split(' ');
      expect(ts, l).toMatch(/^ts:[a-z0-9_]+$/);
      const col = ts.slice(3);
      const create = new RegExp(`create table (if not exists )?public\\.${t}\\s*\\(([\\s\\S]*?)\\n\\);`, 'i').exec(sql)?.[2] ?? '';
      const added = new RegExp(`alter table (if exists )?public\\.${t}[^;]*add column (if not exists )?${col}\\b`, 'i').test(sql);
      expect(new RegExp(`(^|\\n)\\s*${col}\\s+timestamptz`, 'i').test(create) || added, `${t}.${col}`).toBe(true);
    }
  });
});
