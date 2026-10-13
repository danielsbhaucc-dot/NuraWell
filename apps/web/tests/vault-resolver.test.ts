import { describe, it, expect, vi, beforeAll } from 'vitest';
import { randomBytes } from 'node:crypto';
vi.mock('server-only', () => ({}));

beforeAll(() => { process.env.SECURE_VAULT_KEY = randomBytes(32).toString('base64'); });

async function setup(ownerId: string) {
  const { encryptVault } = await import('@/lib/secure-vault/crypto');
  const row = { id: 'item-1', user_id: ownerId, kind: 'id', ...encryptVault('123456782', ownerId) };
  const logs: Record<string, unknown>[] = [];
  const admin = {
    from: (t: string) => t === 'secure_vault_access_log'
      ? { insert: async (r: Record<string, unknown>) => { logs.push(r); return { error: null }; } }
      : { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }) },
  };
  return { admin: admin as never, logs };
}

describe('vault resolver', () => {
  const ref = '[[VAULT:017ab7e6]]';
  it('denies non-allowlisted action (default allowlist is empty)', async () => {
    const { resolveVaultRef } = await import('@/lib/secure-vault/resolver');
    const { admin, logs } = await setup('u1');
    expect(await resolveVaultRef(admin, { userId: 'u1', ref, action: 'chat' })).toEqual({ ok: false, reason: 'denied_action' });
    expect(logs[0].outcome).toBe('denied_action');
  });
  it('denies another user', async () => {
    const { resolveVaultRef } = await import('@/lib/secure-vault/resolver');
    const { admin, logs } = await setup('u1');
    const r = await resolveVaultRef(admin, { userId: 'u2', ref, action: 'x', allow: new Set(['x']) });
    expect(r).toEqual({ ok: false, reason: 'denied_owner' });
    expect(logs[0].outcome).toBe('denied_owner');
  });
  it('grants owner for allowlisted action; audit has no value', async () => {
    const { resolveVaultRef } = await import('@/lib/secure-vault/resolver');
    const { admin, logs } = await setup('u1');
    const r = await resolveVaultRef(admin, { userId: 'u1', ref, action: 'x', allow: new Set(['x']) });
    expect(r).toEqual({ ok: true, value: '123456782', kind: 'id' });
    expect(logs[0]).toMatchObject({ outcome: 'granted', item_id: 'item-1' });
    expect(JSON.stringify(logs)).not.toContain('123456782');
  });
});
