/** Web Crypto only (globalThis.crypto.subtle): runs on Cloudflare Workers, Node ≥20, Vercel (Node or Edge). */
const subtle = () => globalThis.crypto.subtle;
export function b64uEncode(bytes: Uint8Array): string {
  let s = ''; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function b64uDecode(s: string): Uint8Array {
  const t = s.replace(/-/g, '+').replace(/_/g, '/'); const bin = atob(t + '='.repeat((4 - (t.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
const pemBody = (pem: string) => b64uDecode(pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '').replace(/\+/g, '-').replace(/\//g, '_'));
const enc = new TextEncoder();
export async function importPublic(pem: string): Promise<CryptoKey> { return subtle().importKey('spki', pemBody(pem) as BufferSource, { name: 'Ed25519' }, false, ['verify']); }
export async function importPrivate(pem: string): Promise<CryptoKey> { return subtle().importKey('pkcs8', pemBody(pem) as BufferSource, { name: 'Ed25519' }, false, ['sign']); }
export async function verifyStr(key: CryptoKey, data: string, sig: Uint8Array): Promise<boolean> {
  try { return await subtle().verify({ name: 'Ed25519' }, key, sig as BufferSource, enc.encode(data)); } catch { return false; }
}
export async function signStr(key: CryptoKey, data: string): Promise<string> { return b64uEncode(new Uint8Array(await subtle().sign({ name: 'Ed25519' }, key, enc.encode(data)))); }
export const randomId = () => b64uEncode(globalThis.crypto.getRandomValues(new Uint8Array(12)));
