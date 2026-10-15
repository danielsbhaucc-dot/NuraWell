import { createHash, createPublicKey, randomBytes, verify as cryptoVerify } from 'node:crypto';

/**
 * Minimal, dependency-free WebAuthn verification (ES256 / RS256), "none" attestation.
 * Registration trusts the authenticated admin context; every assertion is fully verified:
 * clientData type + challenge + origin, rpIdHash, user-present + user-verified (biometric/PIN of the device),
 * signature counter (clone detection) and the signature itself.
 */
export const b64u = {
  enc: (b: Buffer | Uint8Array) => Buffer.from(b).toString('base64url'),
  dec: (s: string) => Buffer.from(s, 'base64url'),
};
export const newChallenge = () => b64u.enc(randomBytes(32));
const sha256 = (b: Buffer | string) => createHash('sha256').update(b).digest();

type ClientData = { type: string; challenge: string; origin: string };

function parseAuthData(ad: Buffer) {
  if (ad.length < 37) throw new Error('authData too short');
  return { rpIdHash: ad.subarray(0, 32), flags: ad[32], signCount: ad.readUInt32BE(33) };
}

function checkCommon(clientDataJSON: Buffer, authData: Buffer, type: string, challenge: string, rpId: string, origins: string[]) {
  const cd = JSON.parse(clientDataJSON.toString('utf8')) as ClientData;
  if (cd.type !== type) throw new Error('bad clientData type');
  if (cd.challenge !== challenge) throw new Error('challenge mismatch');
  if (!origins.includes(cd.origin)) throw new Error('origin mismatch');
  const a = parseAuthData(authData);
  if (!a.rpIdHash.equals(sha256(rpId))) throw new Error('rpId mismatch');
  if (!(a.flags & 0x01)) throw new Error('user not present');
  if (!(a.flags & 0x04)) throw new Error('user not verified');
  return a;
}

export function verifyRegistration(input: {
  clientDataJSON: string; authenticatorData: string; publicKey: string; alg: number;
  challenge: string; rpId: string; origins: string[];
}) {
  const a = checkCommon(b64u.dec(input.clientDataJSON), b64u.dec(input.authenticatorData), 'webauthn.create', input.challenge, input.rpId, input.origins);
  if (input.alg !== -7 && input.alg !== -257) throw new Error('unsupported alg');
  createPublicKey({ key: b64u.dec(input.publicKey), format: 'der', type: 'spki' }); // must parse
  return { signCount: a.signCount };
}

export function verifyAssertion(input: {
  clientDataJSON: string; authenticatorData: string; signature: string;
  publicKey: string; alg: number; storedSignCount: number;
  challenge: string; rpId: string; origins: string[];
}) {
  const cdj = b64u.dec(input.clientDataJSON);
  const ad = b64u.dec(input.authenticatorData);
  const a = checkCommon(cdj, ad, 'webauthn.get', input.challenge, input.rpId, input.origins);
  if ((a.signCount !== 0 || input.storedSignCount !== 0) && a.signCount <= input.storedSignCount) throw new Error('sign counter replay');
  const key = createPublicKey({ key: b64u.dec(input.publicKey), format: 'der', type: 'spki' });
  const data = Buffer.concat([ad, sha256(cdj)]);
  if (!cryptoVerify('sha256', data, key, b64u.dec(input.signature))) throw new Error('bad signature');
  return { signCount: a.signCount };
}
