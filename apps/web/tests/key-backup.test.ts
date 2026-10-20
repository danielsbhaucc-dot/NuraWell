import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { combineShares, decodeShare, encodeShare, openBackup, sealBackup, splitSecret } from '@/lib/crypto/key-backup';

describe('key backup', () => {
  it('2-of-3 Shamir: any two shares restore, one does not', () => {
    const secret = randomBytes(32);
    const shares = splitSecret(secret, 3, 2).map(encodeShare);
    for (const [a, b] of [[0, 1], [0, 2], [1, 2], [2, 0]]) {
      expect(combineShares([decodeShare(shares[a]), decodeShare(shares[b])]).equals(secret)).toBe(true);
    }
    expect(() => combineShares([decodeShare(shares[0])])).toThrow();
  });
  it('detects a tampered share', () => {
    const shares = splitSecret(randomBytes(32), 3, 2);
    shares[1].data[0] ^= 1;
    expect(() => combineShares([shares[0], shares[1]])).toThrow(/checksum/);
  });
  it('sealed backup round-trips and rejects wrong passphrase', () => {
    const payload = { PII_ENCRYPTION_KEY: randomBytes(32).toString('base64') };
    const file = sealBackup(payload, 'correct horse battery staple 42');
    expect(file).not.toContain(payload.PII_ENCRYPTION_KEY);
    expect(openBackup(file, 'correct horse battery staple 42')).toEqual(payload);
    expect(() => openBackup(file, 'wrong passphrase wrong 42')).toThrow();
  }, 30_000);
});
