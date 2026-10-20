import { createHmac, randomBytes } from 'node:crypto';

/** RFC 6238 TOTP (SHA-1, 6 digits, 30 s) — the format every authenticator app supports. */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32Encode(buf: Buffer): string {
  let bits = 0, val = 0, out = '';
  for (const b of buf) { val = (val << 8) | b; bits += 8; while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31];
  return out;
}
export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, val = 0; const out: number[] = [];
  for (const c of clean) { val = (val << 5) | B32.indexOf(c); bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(out);
}
export const newTotpSecret = () => base32Encode(randomBytes(20));
export const totpStep = (now = Date.now()) => Math.floor(now / 30_000);
export function totpAt(secret: string, step: number): string {
  const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(step));
  const h = createHmac('sha1', base32Decode(secret)).update(msg).digest();
  const o = h[h.length - 1]! & 15;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000)).padStart(6, '0');
}
/** Returns the matched time-step (±1 window) or null. Caller must reject steps <= last used (replay). */
export function verifyTotp(secret: string, code: string, now = Date.now()): number | null {
  const c = (code ?? '').replace(/\D/g, '');
  if (c.length !== 6) return null;
  const s = totpStep(now);
  for (const d of [0, -1, 1]) if (totpAt(secret, s + d) === c) return s + d;
  return null;
}
export const otpauthUri = (secret: string, account: string) =>
  `otpauth://totp/${encodeURIComponent(`NuraWell Ops:${account}`)}?secret=${secret}&issuer=${encodeURIComponent('NuraWell Ops')}&algorithm=SHA1&digits=6&period=30`;
