/**
 * enc:v2 field envelope (Web Crypto only → runs on Node 20+ and Cloudflare Workers).
 * Format: enc:v2:<kid>:<b64url iv>:<b64url ciphertext+tag>
 * - Per-user DEK (AES-256-GCM), wrapped by a KEK held only in the host secret store / KMS.
 * - AAD binds ciphertext to (table, column, ownerId) so a value cannot be moved between rows/users.
 */
const enc = new TextEncoder();
const dec = new TextDecoder();

export const b64u = {
  encode(buf: ArrayBuffer | Uint8Array): string {
    const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let s = ''; for (const x of b) s += String.fromCharCode(x);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  decode(s: string): Uint8Array {
    if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error('bad base64url');
    const p = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
    return Uint8Array.from(atob(p), c => c.charCodeAt(0));
  },
};

export interface FieldContext { table: string; column: string; ownerId: string }
const aad = (c: FieldContext) => enc.encode(`v2|${c.table}|${c.column}|${c.ownerId}`);

export async function importKek(raw: Uint8Array): Promise<CryptoKey> {
  if (raw.byteLength !== 32) throw new Error('KEK must be 32 bytes');
  return crypto.subtle.importKey('raw', raw as BufferSource, 'AES-KW', false, ['wrapKey', 'unwrapKey']);
}
export async function generateDek(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}
export async function wrapDek(dek: CryptoKey, kek: CryptoKey): Promise<string> {
  return b64u.encode(await crypto.subtle.wrapKey('raw', dek, kek, 'AES-KW'));
}
export async function unwrapDek(wrapped: string, kek: CryptoKey): Promise<CryptoKey> {
  return crypto.subtle.unwrapKey('raw', b64u.decode(wrapped) as BufferSource, kek, 'AES-KW',
    { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export const isEnvelope = (v: unknown): v is string =>
  typeof v === 'string' && /^enc:v2:[A-Za-z0-9._-]{1,64}:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{24,}$/.test(v);

export async function encryptField(plain: string, dek: CryptoKey, kid: string, ctx: FieldContext): Promise<string> {
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(kid)) throw new Error('bad kid');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(ctx) }, dek, enc.encode(plain));
  return `enc:v2:${kid}:${b64u.encode(iv)}:${b64u.encode(ct)}`;
}

export async function decryptField(env: string, resolveDek: (kid: string) => Promise<CryptoKey>, ctx: FieldContext): Promise<string> {
  if (!isEnvelope(env)) throw new Error('not an enc:v2 envelope'); // fail closed: never return plaintext passthrough
  const [, , kid, iv, ct] = env.split(':') as [string, string, string, string, string];
  const dek = await resolveDek(kid);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64u.decode(iv) as BufferSource, additionalData: aad(ctx) as BufferSource }, dek, b64u.decode(ct) as BufferSource);
  return dec.decode(pt);
}

/** Blind index for equality lookups on encrypted columns (HMAC-SHA256, separate key). */
export async function blindIndex(value: string, hmacKeyRaw: Uint8Array, ctx: Omit<FieldContext, 'ownerId'>): Promise<string> {
  const k = await crypto.subtle.importKey('raw', hmacKeyRaw as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64u.encode(await crypto.subtle.sign('HMAC', k, enc.encode(`${ctx.table}|${ctx.column}|${value.normalize('NFC')}`)));
}
