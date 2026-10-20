import { generateKeyPairSync, sign } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const old = generateKeyPairSync('ed25519');
const oldPem = old.publicKey.export({ format: 'pem', type: 'spki' }).toString();
vi.mock('@/lib/legal/signing-keys-retired', () => ({
  RETIRED_SIGNING_KEYS: [{ keyId: 'old', pem: oldPem, validFrom: '2026-01-01', retiredAt: '2026-10-20', reason: 'test' }],
}));

import { __resetSigningKeyCache, publishedSigningKeys, signHash, verifySignature } from '@/lib/legal/evidence-crypto';

describe('signing key rotation', () => {
  beforeEach(() => {
    const cur = generateKeyPairSync('ed25519');
    process.env.CONSENT_SIGNING_PRIVATE_KEY = cur.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
    __resetSigningKeyCache();
  });
  it('verifies signatures from the current and retired keys, rejects others', () => {
    const h = 'a'.repeat(64);
    expect(verifySignature(h, signHash(h).signature)).toBe(true);
    expect(verifySignature(h, sign(null, Buffer.from(h, 'utf8'), old.privateKey).toString('base64'))).toBe(true);
    const stranger = generateKeyPairSync('ed25519');
    expect(verifySignature(h, sign(null, Buffer.from(h, 'utf8'), stranger.privateKey).toString('base64'))).toBe(false);
  });
  it('publishes current + retired public keys only', () => {
    const keys = publishedSigningKeys();
    expect(keys.map((k) => k.status)).toEqual(['current', 'retired']);
    expect(JSON.stringify(keys)).not.toContain('PRIVATE');
  });
});
