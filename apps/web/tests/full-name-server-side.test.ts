import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { firstNameFromFullName } from '@/lib/crypto/pii-placeholders';
import { BLOCKED } from '@/lib/security/field-registry';

describe('profiles.full_name handled server-side', () => {
  it('first name never comes from ciphertext', () => {
    expect(firstNameFromFullName('דנה כהן')).toBe('דנה');
    expect(firstNameFromFullName('enc:v2:abc')).toBeNull();
    expect(firstNameFromFullName('enc:v1:abc')).toBeNull();
    expect(firstNameFromFullName(null)).toBeNull();
  });
  it('signup trigger no longer copies the name; SQL fallback ignores encrypted names', () => {
    const sql = readFileSync(new URL('../../../supabase/migrations/000183_full_name_server_side.sql', import.meta.url), 'utf8');
    expect(sql).toMatch(/INSERT INTO public\.profiles \(id, role\)/);
    expect(sql).toMatch(/full_name like 'enc:%' then null/);
  });
  it('signup server action writes full_name through sealProfilePatch', () => {
    const src = readFileSync(new URL('../lib/actions/complete-onboarding.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/sealProfilePatch\(\{\s*full_name: data\.full_name/);
  });
  it('profiles.full_name is no longer blocked', () => {
    expect('profiles.full_name' in BLOCKED).toBe(false);
  });
});
