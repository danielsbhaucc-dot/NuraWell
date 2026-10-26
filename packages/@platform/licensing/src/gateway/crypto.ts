// Web Crypto only (Workers, Node ≥20, Vercel).
const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
export const sha256Hex = async (s: string) => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
export async function hmacHex(keyHex: string, data: string): Promise<string> {
  const raw = Uint8Array.from(keyHex.match(/../g)!.map((h) => parseInt(h, 16)));
  const k = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', k, enc.encode(data)));
}
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0;
}
export const randomHex = (n: number) => hex(crypto.getRandomValues(new Uint8Array(n)).buffer as ArrayBuffer);
/**
 * Signing key = sha256(secret). The Worker stores only that hash (never the secret). Honest limit: someone who
 * reads our KV could sign requests too, so KV access is restricted and keys rotate in one click.
 */
export const signingKeyFromSecret = (secret: string) => sha256Hex(secret);
export const canonicalRequest = (p: { ts: string; nonce: string; origin: string; core: string; bodyHash: string; keyVersion: string }) =>
  ['nwg1', p.ts, p.nonce, p.origin.toLowerCase(), p.core, p.bodyHash, p.keyVersion].join('\n');
