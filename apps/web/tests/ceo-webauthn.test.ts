import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { b64u, verifyAssertion, verifyRegistration } from '@/lib/ceo/webauthn';

const rpId = 'ops.nurawell.ai';
const origin = `https://${rpId}`;
const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const spki = b64u.enc(publicKey.export({ format: 'der', type: 'spki' }));
const authData = (flags: number, count: number) => {
  const b = Buffer.alloc(37);
  createHash('sha256').update(rpId).digest().copy(b, 0);
  b[32] = flags;
  b.writeUInt32BE(count, 33);
  return b;
};
const cd = (type: string, challenge: string, o = origin) => Buffer.from(JSON.stringify({ type, challenge, origin: o }));
function assertion(challenge: string, count: number, flags = 0x05, o = origin) {
  const ad = authData(flags, count);
  const c = cd('webauthn.get', challenge, o);
  const sig = sign('sha256', Buffer.concat([ad, createHash('sha256').update(c).digest()]), privateKey);
  return { clientDataJSON: b64u.enc(c), authenticatorData: b64u.enc(ad), signature: b64u.enc(sig), publicKey: spki, alg: -7, challenge, rpId, origins: [origin] };
}

describe('webauthn', () => {
  it('registers with UV', () => {
    expect(verifyRegistration({ clientDataJSON: b64u.enc(cd('webauthn.create', 'ch')), authenticatorData: b64u.enc(authData(0x45, 0)), publicKey: spki, alg: -7, challenge: 'ch', rpId, origins: [origin] }).signCount).toBe(0);
  });
  it('accepts a valid biometric assertion', () => {
    expect(verifyAssertion({ ...assertion('c1', 5), storedSignCount: 4 }).signCount).toBe(5);
  });
  it('rejects: wrong challenge, wrong origin, no UV, counter replay, tampered signature', () => {
    expect(() => verifyAssertion({ ...assertion('c1', 5), challenge: 'other', storedSignCount: 0 })).toThrow(/challenge/);
    expect(() => verifyAssertion({ ...assertion('c1', 5, 0x05, 'https://evil.example'), storedSignCount: 0 })).toThrow(/origin/);
    expect(() => verifyAssertion({ ...assertion('c1', 5, 0x01), storedSignCount: 0 })).toThrow(/verified/);
    expect(() => verifyAssertion({ ...assertion('c1', 5), storedSignCount: 5 })).toThrow(/replay/);
    const a = assertion('c1', 6);
    expect(() => verifyAssertion({ ...a, signature: assertion('c1', 7).signature, storedSignCount: 0 })).toThrow(/signature/);
  });
});
