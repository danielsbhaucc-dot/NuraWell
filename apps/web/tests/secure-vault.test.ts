import { describe, it, expect, beforeAll, vi } from 'vitest';
import { randomBytes } from 'node:crypto';

const inserted: Record<string, unknown>[] = [];
vi.mock('@/lib/api/route-guards', () => ({ requireApiSession: async () => ({ ok: true, user: { id: 'u-1' } }) }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: () => ({ insert: async (row: Record<string, unknown>) => { inserted.push(row); return { error: null }; } }) }),
}));

beforeAll(() => { process.env.SECURE_VAULT_KEY = randomBytes(32).toString('base64'); });

describe('secure vault', () => {
  it('AES-256-GCM roundtrip, bound to owner', async () => {
    const { encryptVault, decryptVault } = await import('@/lib/secure-vault/crypto');
    const e = encryptVault('123456782', 'u-1');
    expect(e.ciphertext).not.toContain('123456782');
    expect(decryptVault(e, 'u-1')).toBe('123456782');
    expect(() => decryptVault(e, 'u-2')).toThrow();
  });
  it('API stores only ciphertext and returns ref + type-only notice', async () => {
    const log = vi.spyOn(console, 'error');
    const { POST } = await import('@/app/api/v1/secure-vault/route');
    const res = await POST(new Request('http://x/api/v1/secure-vault', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'card', value: '4580123456789123' }) }));
    const txt = await res.text();
    expect(res.status).toBe(200);
    expect(txt).not.toContain('4580123456789123');
    const j = JSON.parse(txt);
    expect(j.ref).toMatch(/^\[\[VAULT:[0-9a-f]{8}\]\]$/);
    expect(j.notice).toBe('🔒 שמרתי בכספת המאובטחת פריט מסוג כרטיס אשראי.');
    expect(JSON.stringify(inserted[0])).not.toContain('4580123456789123');
    expect(inserted[0].last4).toBe('9123');
    expect(JSON.stringify(log.mock.calls)).not.toContain('4580');
  });
  it('fails closed without key', async () => {
    delete process.env.SECURE_VAULT_KEY;
    const { POST } = await import('@/app/api/v1/secure-vault/route');
    const res = await POST(new Request('http://x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'id', value: '123456782' }) }));
    expect(res.status).toBe(503);
  });
});
