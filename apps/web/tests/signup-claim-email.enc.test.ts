import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { __resetFieldCrypto, decryptValue, setDekStoreForTests, type DekStore } from '@/lib/security/field-crypto';
import type { WrappedDek } from '@/lib/security/field-envelope';
import { SYSTEM_ROW } from '@/lib/security/field-registry';
import { normalizeSignupEmail, sealSignupEmailBinding, signupEmailBidx } from '@/lib/central/signup-claim-email';
import { beginSignupClaim } from '@/lib/central/signup-claim';

function memStore(): DekStore {
  const rows = new Map<string, WrappedDek>();
  return {
    async get(u) { return rows.get(u) ?? null; },
    async putIfAbsent(u, w) { if (!rows.has(u)) rows.set(u, w); return rows.get(u)!; },
  };
}

let prev: string | undefined;
beforeEach(() => {
  prev = process.env.PII_ENCRYPTION_KEY;
  process.env.PII_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  __resetFieldCrypto();
  setDekStoreForTests(memStore());
});
afterEach(() => { process.env.PII_ENCRYPTION_KEY = prev; __resetFieldCrypto(); setDekStoreForTests(null); });

describe('signup claim email seal+bidx', () => {
  it('seals email and produces stable keyed bidx (case-insensitive)', async () => {
    const { sealed, bidx } = await sealSignupEmailBinding('One@Example.TEST');
    expect(sealed.startsWith('enc:v2:')).toBe(true);
    expect(sealed.toLowerCase()).not.toContain('one@example.test');
    expect(bidx).toBe(signupEmailBidx('one@example.test'));
    expect(bidx).toBe(signupEmailBidx('ONE@example.test'));
    expect(normalizeSignupEmail('  One@Example.TEST ')).toBe('one@example.test');
    const plain = await decryptValue('parent_signup_claims', 'email', 'system:audit', SYSTEM_ROW, sealed);
    expect(plain).toBe('one@example.test');
  });

  it('beginSignupClaim rejects when PII key missing (before RPC)', async () => {
    delete process.env.PII_ENCRYPTION_KEY;
    __resetFieldCrypto();
    const rpc = { rpc: async () => { throw new Error('rpc_should_not_run'); } };
    const r = await beginSignupClaim(rpc, { nonce: 'n'.repeat(32), sub: 'parent-sub-a', email: 'a@example.test' });
    expect(r.status).toBe('rejected');
  });

  it('bidx domain-separates table.column and canonicalizes case', async () => {
    const a = signupEmailBidx('Same@Example.test');
    const b = signupEmailBidx('same@example.test');
    expect(a).toBe(b);
    const { blindIndexFor } = await import('@/lib/security/field-crypto');
    const other = blindIndexFor('notifications', 'email', 'same@example.test');
    expect(other).not.toBe(a);
  });

  it('beginSignupClaim passes sealed+bidx to RPC (no plaintext email arg)', async () => {
    const calls: Record<string, unknown>[] = [];
    const rpc = {
      rpc: async (name: string, args: Record<string, unknown>) => {
        calls.push({ name, ...args });
        return { data: 'claimed:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', error: null };
      },
    };
    const r = await beginSignupClaim(rpc, { nonce: 'n'.repeat(32), sub: 'parent-sub-a', email: 'bind@example.test' });
    expect(r).toEqual({ status: 'claimed', attempt: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' });
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe('parent_signup_begin');
    expect(calls[0].p_email).toBeUndefined();
    expect(String(calls[0].p_email_sealed)).toMatch(/^enc:v2:/);
    expect(String(calls[0].p_email_bidx).length).toBeGreaterThanOrEqual(16);
    expect(JSON.stringify(calls)).not.toMatch(/bind@example\.test/i);
  });
});
