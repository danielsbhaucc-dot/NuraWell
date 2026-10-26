import { randomBytes } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

/**
 * AES-GCM in Node accepts a *truncated* auth tag (down to 4 bytes) unless authTagLength is pinned.
 * A truncated prefix of the real tag must never decrypt: with a 4-byte tag a forgery costs ~2^32 tries.
 */
const trunc = (b64: string, enc: BufferEncoding) => Buffer.from(b64, enc).subarray(0, 4).toString(enc);

describe('AES-GCM auth tag length is pinned to 16 bytes', () => {
  it('pii: legacy enc:v1 rejects a truncated tag, round-trip still works', async () => {
    process.env.PII_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    const { encryptString, decryptString, __resetPiiKeyCache } = await import('@/lib/crypto/pii');
    __resetPiiKeyCache();
    const enc = encryptString('שלום 123', 'u-1');
    expect(decryptString(enc, 'u-1')).toBe('שלום 123');
    const [iv, tag, ct] = enc.slice('enc:v1:'.length).split('.');
    expect(() => decryptString(`enc:v1:${iv}.${trunc(tag, 'base64url')}.${ct}`, 'u-1')).toThrow();
  });

  it('secure vault rejects a truncated tag', async () => {
    process.env.SECURE_VAULT_KEY = randomBytes(32).toString('base64');
    const { encryptVault, decryptVault } = await import('@/lib/secure-vault/crypto');
    const e = encryptVault('123456782', 'u-1');
    expect(decryptVault(e, 'u-1')).toBe('123456782');
    expect(() => decryptVault({ ...e, tag: trunc(e.tag, 'base64') }, 'u-1')).toThrow();
  });

  it('gideon settings secret rejects a truncated tag', async () => {
    const { encryptSecret, decryptSecret } = await import('@/lib/ceo/settings');
    const k = randomBytes(32);
    const enc = encryptSecret('bot-token-xyz', k);
    expect(decryptSecret(enc, k)).toBe('bot-token-xyz');
    const [v, iv, tag, data] = enc.split(':');
    expect(() => decryptSecret([v, iv, trunc(tag, 'base64'), data].join(':'), k)).toThrow();
  });

  it('key backup file rejects a truncated tag', async () => {
    const { sealBackup, openBackup } = await import('@/lib/crypto/key-backup');
    const file = sealBackup({ A: 'x' }, 'correct horse battery staple 42');
    expect(openBackup(file, 'correct horse battery staple 42')).toEqual({ A: 'x' });
    const f = JSON.parse(file) as { tag: string };
    f.tag = trunc(f.tag, 'base64');
    expect(() => openBackup(JSON.stringify(f), 'correct horse battery staple 42')).toThrow();
  });
});
