import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COLUMN_CLASSIFICATION } from '@/lib/security/column-classification';
import { ENCRYPTED_TABLES } from '@/lib/security/field-registry';

const mig239 = readFileSync(join(__dirname, '../../../supabase/migrations/000239_parent_signup_claim.sql'), 'utf8');
const mig241 = readFileSync(join(__dirname, '../../../supabase/migrations/000241_parent_signup_attempt.sql'), 'utf8');

describe('parent_signup_claims classification (239/241)', () => {
  it('classifies all four text columns with honest sensitivity', () => {
    const row = COLUMN_CLASSIFICATION.parent_signup_claims;
    expect(row).toBeTruthy();
    expect(row.nonce[0]).toBe('non_sensitive');
    expect(row.parent_sub[0]).toBe('non_sensitive');
    expect(row.state[0]).toBe('non_sensitive');
    expect(row.email[0]).toBe('sensitive');
    expect(row.email[1]).toMatch(/pending|SQL|blind|equality/i);
    // Must not pretend email is non-personal just to green the schema test.
    expect(row.email[0]).not.toBe('non_sensitive');
    // Taxonomy non_sensitive ≠ public: reasons must keep the operational-identifier caveat.
    expect(row.nonce[1]).toMatch(/linkable|operational|RLS|redaction|retention/i);
    expect(row.parent_sub[1]).toMatch(/linkable|pseudonymous|RLS|redaction|retention/i);
  });

  it('keeps email out of live encryption until SQL equality is moved', () => {
    expect(ENCRYPTED_TABLES.parent_signup_claims).toBeUndefined();
  });

  it('documents lock/query-key use and service_role-only access in migrations', () => {
    expect(mig239).toMatch(/nonce text primary key/);
    expect(mig239).toMatch(/where nonce = p_nonce/);
    expect(mig239).toMatch(/row\.parent_sub <> p_sub or row\.email <> p_email/);
    expect(mig239).toMatch(/revoke all on table public\.parent_signup_claims from public, anon, authenticated/);
    expect(mig239).toMatch(/grant select, insert, update, delete on table public\.parent_signup_claims to service_role/);
    expect(mig239).toMatch(/state in \('open', 'done', 'failed'\)/);
    // 241 keeps the same equality compares (attempt_id added; email still compared in SQL).
    expect(mig241).toMatch(/row\.parent_sub <> p_sub or row\.email <> p_email/);
    expect(mig241).toMatch(/where nonce = p_nonce/);
  });
});
