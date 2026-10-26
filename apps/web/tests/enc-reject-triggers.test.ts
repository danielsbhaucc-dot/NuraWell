import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ENC_TRIGGER_MARK, encRejectSpec, encRejectTriggersSql } from '@/lib/security/enc-reject-triggers';
import { ENCRYPTED_TABLES, FIELD_V2_TABLES, isBlocked } from '@/lib/security/field-registry';

const DIR = join(__dirname, '../../../supabase/migrations');
const files = readdirSync(DIR).filter((f) => /^\d+_.*\.sql$/.test(f)).sort();
const generated = files.filter((f) => readFileSync(join(DIR, f), 'utf8').includes(ENC_TRIGGER_MARK));

describe('enc-reject triggers stay in sync with field-registry', () => {
  it('the newest generated trigger migration equals the registry (regenerate into a NEW migration with scripts/gen-enc-triggers.mts)', () => {
    expect(generated.length).toBeGreaterThan(0);
    const sql = readFileSync(join(DIR, generated[generated.length - 1]), 'utf8');
    expect(sql.slice(sql.indexOf(ENC_TRIGGER_MARK))).toBe(encRejectTriggersSql());
  });

  it('every registered, non-BLOCKED column of a v2 table is covered by its trigger', () => {
    const spec = new Map(encRejectSpec());
    const reg = ENCRYPTED_TABLES as Record<string, { columns: Record<string, string> }>;
    for (const t of FIELD_V2_TABLES)
      for (const c of Object.keys(reg[t]?.columns ?? {})) if (!isBlocked(t, c)) expect(spec.get(t), `${t}.${c}`).toContain(c);
  });

  it('the enforcement function and one-way activation flag exist in the migrations', () => {
    const all = files.map((f) => readFileSync(join(DIR, f), 'utf8')).join('\n');
    expect(all).toMatch(/create table if not exists public\.field_enc_enforcement/);
    expect(all).toMatch(/function public\.enc_reject_plaintext\(\) returns trigger\s+language plpgsql security definer/);
    expect(all).toMatch(/deactivation is not allowed/);
    expect(all).toMatch(/is not distinct from \(oj -> c\)/);
  });
});
