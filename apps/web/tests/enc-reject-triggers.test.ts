import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ENC_TRIGGER_MARK, encRejectSpec, encRejectTriggersSql } from '@/lib/security/enc-reject-triggers';
import { ENCRYPTED_TABLES, FIELD_V2_TABLES, SWEEP_TABLES, isBlocked } from '@/lib/security/field-registry';
import { plaintextGuardLines } from '@/lib/security/plaintext-guard-list';

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
    for (const t of FIELD_V2_TABLES) {
      if (t in SWEEP_TABLES) { expect(spec.has(t), `${t} is swept, no reject trigger`).toBe(false); continue; }
      for (const c of Object.keys(reg[t]?.columns ?? {})) if (!isBlocked(t, c)) expect(spec.get(t), `${t}.${c}`).toContain(c);
    }
  });

  it('swept tables get an age-bounded nightly enforce line', () => {
    const lines = plaintextGuardLines().filter((l) => l.startsWith('sweep auth_session_trail '));
    expect(lines.map((l) => l.split(' ')[2]).sort()).toEqual(['ip', 'user_agent']);
    for (const l of lines) expect(l.endsWith(' 15 created_at')).toBe(true);
  });

  it('the enforcement function and one-way activation flag exist in the migrations', () => {
    const all = files.map((f) => readFileSync(join(DIR, f), 'utf8')).join('\n');
    expect(all).toMatch(/create table if not exists public\.field_enc_enforcement/);
    expect(all).toMatch(/function public\.enc_reject_plaintext\(\) returns trigger\s+language plpgsql security definer/);
    expect(all).toMatch(/deactivation is not allowed/);
    expect(all).toMatch(/is not distinct from \(oj -> c\)/);
  });
});
