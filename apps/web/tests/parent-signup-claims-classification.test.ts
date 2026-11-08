import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COLUMN_CLASSIFICATION } from '@/lib/security/column-classification';
import { ENCRYPTED_TABLES, FIELD_V2_LOCAL_BACKFILL_ONLY } from '@/lib/security/field-registry';

const mig239 = readFileSync(join(__dirname, '../../../supabase/migrations/000239_parent_signup_claim.sql'), 'utf8');
const mig241 = readFileSync(join(__dirname, '../../../supabase/migrations/000241_parent_signup_attempt.sql'), 'utf8');
const mig251 = readFileSync(join(__dirname, '../../../supabase/migrations/000251_parent_signup_email_ciphertext.sql'), 'utf8');

describe('parent_signup_claims classification (239/241/251)', () => {
  it('classifies email as sensitive sealed+bidx; nonce/sub stay operational locks', () => {
    const row = COLUMN_CLASSIFICATION.parent_signup_claims;
    expect(row).toBeTruthy();
    expect(row.nonce[0]).toBe('non_sensitive');
    expect(row.parent_sub[0]).toBe('non_sensitive');
    expect(row.state[0]).toBe('non_sensitive');
    expect(row.email[0]).toBe('sensitive');
    expect(row.email[1]).toMatch(/enc:v2|bidx|legacy/i);
    expect(row.email_bidx[0]).toBe('non_sensitive');
    expect(row.email_bidx[1]).toMatch(/HMAC|blind|keyed/i);
    expect(row.nonce[1]).toMatch(/linkable|operational|RLS|redaction|retention/i);
    expect(row.parent_sub[1]).toMatch(/linkable|pseudonymous|RLS|redaction|retention/i);
  });

  it('registers email in live encryption with local-backfill-only (legacy retained)', () => {
    expect(ENCRYPTED_TABLES.parent_signup_claims?.columns.email).toBe('text');
    expect(FIELD_V2_LOCAL_BACKFILL_ONLY).toContain('parent_signup_claims');
  });

  it('documents nonce lock; 251 moves equality to keyed email_bidx', () => {
    expect(mig239).toMatch(/nonce text primary key/);
    expect(mig239).toMatch(/where nonce = p_nonce/);
    expect(mig239).toMatch(/row\.parent_sub <> p_sub or row\.email <> p_email/);
    expect(mig241).toMatch(/row\.parent_sub <> p_sub or row\.email <> p_email/);
    expect(mig251).toMatch(/p_email_sealed/);
    expect(mig251).toMatch(/p_email_bidx/);
    expect(mig251).toMatch(/email_bidx is distinct from p_email_bidx/);
    expect(mig251).toMatch(/enc:v2:%/);
    expect(mig251).toMatch(/Legacy plaintext/);
  });
});
