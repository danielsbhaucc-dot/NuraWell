import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COLUMN_CLASSIFICATION } from '@/lib/security/column-classification';
import { BLOCKED, ENCRYPTED_TABLES, FIELD_V2_TABLES, isBlocked } from '@/lib/security/field-registry';
import { schemaFromMigrations, textLikeColumns } from './helpers/migration-schema';

const MIGRATIONS = join(__dirname, '../../../supabase/migrations');

describe('column classification covers the schema', () => {
  const cols = textLikeColumns(schemaFromMigrations(MIGRATIONS));

  it('parses a plausible schema from the migrations', () => {
    expect(cols.length).toBeGreaterThan(500);
  });

  it('every text/varchar/json/bytea column created by a migration is classified', () => {
    const missing = cols.filter(([t, c]) => !COLUMN_CLASSIFICATION[t]?.[c]).map(([t, c, ty]) => `${t}.${c} (${ty})`);
    // Add each one to lib/security/column-classification.ts as 'sensitive' (and to field-registry) or
    // 'non_sensitive' with a one-line reason. New columns cannot merge unclassified.
    expect(missing).toEqual([]);
  });

  it('every non_sensitive entry has a reason, every registered column is classified sensitive', () => {
    for (const [t, cs] of Object.entries(COLUMN_CLASSIFICATION))
      for (const [c, [k, why]] of Object.entries(cs)) {
        expect(['sensitive', 'non_sensitive'], `${t}.${c}`).toContain(k);
        expect(why.trim().length, `${t}.${c}`).toBeGreaterThan(3);
      }
    for (const [t, spec] of Object.entries(ENCRYPTED_TABLES))
      for (const c of Object.keys(spec.columns)) expect(COLUMN_CLASSIFICATION[t]?.[c]?.[0], `${t}.${c}`).toBe('sensitive');
  });

  it('sensitive + registered + unblocked columns are live on v2 (in FIELD_V2 / backfill)', () => {
    for (const [t, spec] of Object.entries(ENCRYPTED_TABLES))
      for (const c of Object.keys(spec.columns)) if (!isBlocked(t, c)) expect(FIELD_V2_TABLES, `${t}.${c}`).toContain(t);
    for (const k of Object.keys(BLOCKED)) expect(COLUMN_CLASSIFICATION[k.split('.')[0]]?.[k.split('.')[1]]?.[1], k).toMatch(/BLOCKED/);
  });
});
