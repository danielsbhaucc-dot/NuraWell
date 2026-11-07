/** Request signing for server products: HMAC-SHA256 over ts, nonce, path and the body hash. Web Crypto only. */
const te = new TextEncoder();
const b64u = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
export const sha256hex = async (b: Uint8Array | string) => hex(await crypto.subtle.digest('SHA-256', (typeof b === 'string' ? te.encode(b) : b) as BufferSource));
export const nonce = () => b64u(crypto.getRandomValues(new Uint8Array(18)).buffer);
export const base = async (ts: string, n: string, path: string, body: Uint8Array) => `${ts}\n${n}\n${path}\n${await sha256hex(body)}`;
async function hmac(secret: string, msg: string) { const k = await crypto.subtle.importKey('raw', te.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); return b64u(await crypto.subtle.sign('HMAC', k, te.encode(msg))); }
export async function signRequest(keyId: string, secret: string, path: string, body: Uint8Array, now = Date.now()): Promise<Record<string, string>> {
  const ts = String(now), n = nonce();
  return { 'x-pl-key': keyId, 'x-pl-ts': ts, 'x-pl-nonce': n, 'x-pl-sig': await hmac(secret, await base(ts, n, path, body)) };
}
/** Constant-time compare of the expected signature. Freshness (±skew) is checked here; replay (nonce reuse) by the caller's store. */
export async function verifyRequest(h: { ts?: string | null; nonce?: string | null; sig?: string | null }, secret: string, path: string, body: Uint8Array, skewMs: number, now = Date.now()): Promise<boolean> {
  if (!h.ts || !h.nonce || !h.sig || !/^\d{13}$/.test(h.ts) || Math.abs(Number(h.ts) - now) > skewMs || !secret) return false;
  const want = await hmac(secret, await base(h.ts, h.nonce, path, body));
  if (want.length !== h.sig.length) return false;
  let d = 0; for (let i = 0; i < want.length; i++) d |= want.charCodeAt(i) ^ h.sig.charCodeAt(i); return d === 0;
}
/** Central side: a server product's secret is derived from one master secret + its key id (so the DB never holds secrets). */
export const deriveSecret = (master: string, keyId: string) => hmac(master, `pl1|${keyId}`);
