import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/privacy/health-consent', async (orig) => ({
  ...(await orig<typeof import('@/lib/privacy/health-consent')>()),
  healthConsentStatus: async () => 'granted',
}));

import { __resetFieldCrypto, setDekStoreForTests, type DekStore } from '@/lib/security/field-crypto';
import type { WrappedDek } from '@/lib/security/field-envelope';
import { decProfileResult } from '@/lib/crypto/pii-fields';
import { sealProfilePatch, __setFirstNameLookup } from '@/lib/crypto/pii-seal';

const U = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';

function memStore(seed?: Map<string, WrappedDek>): DekStore {
  const rows = seed ?? new Map<string, WrappedDek>();
  return {
    async get(u) { return rows.get(u) ?? null; },
    async putIfAbsent(u, w) { if (!rows.has(u)) rows.set(u, w); return rows.get(u)!; },
  };
}

describe('PII key missing / wrong key fail closed', () => {
  let prevKey: string | undefined;
  beforeEach(() => {
    prevKey = process.env.PII_ENCRYPTION_KEY;
    __setFirstNameLookup(async () => 'נועה');
  });
  afterEach(() => {
    process.env.PII_ENCRYPTION_KEY = prevKey;
    __setFirstNameLookup(null);
    setDekStoreForTests(null);
    __resetFieldCrypto();
  });

  it('sealProfilePatch throws when PII_ENCRYPTION_KEY is absent (no ciphertext, no plaintext write)', async () => {
    delete process.env.PII_ENCRYPTION_KEY;
    __resetFieldCrypto();
    setDekStoreForTests(memStore());
    await expect(sealProfilePatch({ full_name: 'דניאל', date_of_birth: '1990-05-04' }, U))
      .rejects.toThrow(/PII_ENCRYPTION_KEY missing/);
  });

  it('authorized decrypt round-trips; other user and wrong root key fail closed', async () => {
    process.env.PII_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    __resetFieldCrypto();
    const rows = new Map<string, WrappedDek>();
    setDekStoreForTests(memStore(rows));
    const sealed = await sealProfilePatch({ full_name: 'דניאל', date_of_birth: '1990-05-04' }, U);
    expect(String(sealed.date_of_birth)).toMatch(/^enc:v2:/);
    expect(String(sealed.date_of_birth)).not.toContain('1990');
    // full_name may already be registered; if sealed, must be enc:v2 without plaintext
    if (String(sealed.full_name).startsWith('enc:v2:')) {
      expect(String(sealed.full_name)).not.toContain('דניאל');
    }

    const back = await decProfileResult(U)({ data: { id: U, ...sealed } }).then((r) => r.data as Record<string, unknown>);
    expect(back.date_of_birth).toBe('1990-05-04');

    const other = await decProfileResult(U2)({ data: { id: U2, ...sealed } }).then((r) => r.data as Record<string, unknown>);
    // fail-closed: ciphertext must not surface as plaintext to another user
    expect(other.date_of_birth).not.toBe('1990-05-04');
    expect(String(other.date_of_birth ?? '')).not.toContain('1990-05-04');

    // wrong root key cannot recover plaintext (fail-closed → null / no ISO)
    process.env.PII_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    __resetFieldCrypto();
    setDekStoreForTests(memStore(rows));
    const wrong = await decProfileResult(U)({ data: { id: U, ...sealed } }).then((r) => r.data as Record<string, unknown>);
    expect(wrong.date_of_birth).not.toBe('1990-05-04');
    expect(String(wrong.date_of_birth ?? '')).not.toContain('1990');
  });

  it('complete-onboarding releases the claim when seal throws (source guard)', () => {
    const src = readFileSync(new URL('../lib/actions/complete-onboarding.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/let sealedProfile/);
    expect(src).toMatch(/catch \{[\s\S]*failSignupClaim[\s\S]*שמירת הפרופיל נכשלה/);
    expect(src).not.toMatch(/\.update\(await sealProfilePatch\(/);
  });
});
