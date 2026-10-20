/**
 * Offline key-backup primitives (no network, no env access).
 *  - Shamir secret sharing over GF(256) (AES polynomial 0x11b), k-of-n.
 *  - Passphrase-sealed backup file: scrypt (N=2^17, r=8, p=1) → AES-256-GCM.
 * Used by scripts/keys/keybackup.ts and the admin-only /api/v1/admin/key-backup route (server only).
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from 'node:crypto';

const EXP = new Uint8Array(510);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x ^= (x << 1) ^ (x & 0x80 ? 0x11b : 0);
    x &= 0xff;
  }
  for (let i = 255; i < 510; i++) EXP[i] = EXP[i - 255];
})();
const mul = (a: number, b: number) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);
const div = (a: number, b: number) => {
  if (b === 0) throw new Error('div by zero');
  return a === 0 ? 0 : EXP[(LOG[a] + 255 - LOG[b]) % 255];
};

export type Share = { x: number; k: number; data: Buffer; check: string };

const checksum = (secret: Buffer) => createHash('sha256').update(secret).digest('hex').slice(0, 8);

export function splitSecret(secret: Buffer, n: number, k: number): Share[] {
  if (k < 2 || k > n || n > 255) throw new Error('invalid k/n');
  const shares = Array.from({ length: n }, (_, i) => ({ x: i + 1, k, data: Buffer.alloc(secret.length), check: checksum(secret) }));
  for (let b = 0; b < secret.length; b++) {
    const coeffs = [secret[b], ...randomBytes(k - 1)];
    for (const s of shares) {
      let y = 0;
      for (let c = coeffs.length - 1; c >= 0; c--) y = mul(y, s.x) ^ coeffs[c];
      s.data[b] = y;
    }
  }
  return shares;
}

export function combineShares(shares: Share[]): Buffer {
  if (shares.length === 0) throw new Error('no shares');
  const k = shares[0].k;
  if (shares.length < k) throw new Error(`need ${k} shares`);
  const use = shares.slice(0, k);
  if (new Set(use.map((s) => s.x)).size !== use.length) throw new Error('duplicate share');
  const len = use[0].data.length;
  const out = Buffer.alloc(len);
  for (let b = 0; b < len; b++) {
    let acc = 0;
    for (let i = 0; i < use.length; i++) {
      let num = 1;
      let den = 1;
      for (let j = 0; j < use.length; j++) {
        if (i === j) continue;
        num = mul(num, use[j].x);
        den = mul(den, use[j].x ^ use[i].x);
      }
      acc ^= mul(use[i].data[b], div(num, den));
    }
    out[b] = acc;
  }
  if (checksum(out) !== use[0].check) throw new Error('share checksum mismatch');
  return out;
}

export const encodeShare = (s: Share) => `NWKS1-${s.k}-${s.x}-${s.check}-${s.data.toString('base64url')}`;
export function decodeShare(t: string): Share {
  const m = /^NWKS1-(\d+)-(\d+)-([0-9a-f]{8})-([A-Za-z0-9_-]+)$/.exec(t.trim());
  if (!m) throw new Error('bad share format');
  return { k: Number(m[1]), x: Number(m[2]), check: m[3], data: Buffer.from(m[4], 'base64url') };
}

const SCRYPT = { N: 1 << 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };

export function sealBackup(payload: Record<string, string>, passphrase: string): string {
  if (passphrase.length < 16) throw new Error('passphrase must be >= 16 chars');
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = scryptSync(passphrase.normalize('NFC'), salt, 32, SCRYPT);
  const c = createCipheriv('aes-256-gcm', key, iv);
  c.setAAD(Buffer.from('nurawell-key-backup-v1'));
  const ct = Buffer.concat([c.update(JSON.stringify(payload), 'utf8'), c.final()]);
  return JSON.stringify({ v: 1, kdf: 'scrypt', N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, salt: salt.toString('base64'), iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), ct: ct.toString('base64'), created_at: new Date().toISOString(), names: Object.keys(payload) });
}

export function openBackup(file: string, passphrase: string): Record<string, string> {
  const f = JSON.parse(file) as { v: number; N: number; r: number; p: number; salt: string; iv: string; tag: string; ct: string };
  if (f.v !== 1) throw new Error('unknown backup version');
  const key = scryptSync(passphrase.normalize('NFC'), Buffer.from(f.salt, 'base64'), 32, { N: f.N, r: f.r, p: f.p, maxmem: SCRYPT.maxmem });
  const d = createDecipheriv('aes-256-gcm', key, Buffer.from(f.iv, 'base64'));
  d.setAAD(Buffer.from('nurawell-key-backup-v1'));
  d.setAuthTag(Buffer.from(f.tag, 'base64'));
  return JSON.parse(Buffer.concat([d.update(Buffer.from(f.ct, 'base64')), d.final()]).toString('utf8')) as Record<string, string>;
}
