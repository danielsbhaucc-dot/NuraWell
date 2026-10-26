import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify, createHash } from 'node:crypto';

/** Fails closed: a missing/malformed key returns null and the caller disables the feature. */
export function loadSigningKey(pem: string | undefined | null) {
  if (!pem || !pem.includes('PRIVATE KEY')) return null;
  try { const k = createPrivateKey(pem); return k.asymmetricKeyType === 'ed25519' ? k : null; } catch { return null; }
}
export function publicKeyPemFrom(privatePem: string): string {
  return createPublicKey(createPrivateKey(privatePem)).export({ type: 'spki', format: 'pem' }).toString();
}
export function ed25519Sign(privatePem: string, data: string): Buffer {
  return sign(null, Buffer.from(data), createPrivateKey(privatePem));
}
export function ed25519Verify(publicPem: string, data: string, sig: Buffer): boolean {
  try { return verify(null, Buffer.from(data), createPublicKey(publicPem), sig); } catch { return false; }
}
/** For tests and the one-time key ceremony only; never persisted by this package. */
export function generateSigningKeyPair() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return { privatePem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), publicPem: publicKey.export({ type: 'spki', format: 'pem' }).toString() };
}
export const sha256 = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
/** Key id shown in the hub / revocation list: derived, short, not reversible to anything secret. */
export const keyIdFor = (publicPem: string) => sha256(publicPem).slice(0, 16);
