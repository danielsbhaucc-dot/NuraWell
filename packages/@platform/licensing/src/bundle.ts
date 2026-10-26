import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { b64u, unb64u, canonicalJson } from './b64';
import { ed25519Sign, ed25519Verify, sha256 } from './keys';

/** Per-buyer invisible watermark: licensee id encoded as zero-width characters inside a string literal. */
const ZW = ['\u200b', '\u200c', '\u200d', '\u2060'];
export function encodeWatermark(id: string): string {
  return [...Buffer.from(id, 'utf8')].map((b) => [6, 4, 2, 0].map((s) => ZW[(b >> s) & 3]).join('')).join('');
}
export function extractWatermark(content: string): string | null {
  const m = content.match(/[\u200b\u200c\u200d\u2060]{4,}/);
  if (!m || m[0].length % 4) return null;
  const bytes: number[] = [];
  for (let i = 0; i < m[0].length; i += 4) bytes.push([0, 1, 2, 3].reduce((a, j) => (a << 2) | ZW.indexOf(m[0][i + j]), 0));
  return Buffer.from(bytes).toString('utf8');
}

/** Hub helper: given an uploaded (or leaked) file, report which known buyer watermark it matches. No PII beyond the opaque licensee id. */
export function matchBuyerWatermark(content: string, known: { id: string; label?: string }[]): { id: string; label?: string } | null {
  const found = extractWatermark(content);
  if (!found) return null;
  const hit = known.find((k) => k.id === found);
  return hit ?? null;
}

export type BundleFile = { path: string; content: string };
export type BundleManifest = { v: 1; moduleId: string; version: string; lid: string; watermark: string; files: { path: string; sha256: string }[]; sealed?: boolean };
export type Transform = (code: string, path: string) => Promise<string> | string;
export type SealedFile = { path: string; sealed: string }; // path.enc content = nwc1.<iv>.<ct+tag> base64url parts joined

export function generateContentKey(): Buffer { return randomBytes(32); }
export function contentKeyB64(key: Buffer): string { return b64u(key); }

/** AES-256-GCM: sealed = `nwc1.` + b64u(iv 12) + `.` + b64u(ciphertext||tag). */
export function sealBytes(key: Buffer, plain: Buffer | string): string {
  if (key.length !== 32) throw new Error('AES-256 key required');
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(typeof plain === 'string' ? Buffer.from(plain, 'utf8') : plain), c.final()]);
  const tag = c.getAuthTag();
  return `nwc1.${b64u(iv)}.${b64u(Buffer.concat([ct, tag]))}`;
}
export function openBytes(key: Buffer, sealed: string): Buffer {
  const parts = sealed.split('.');
  if (parts.length !== 3 || parts[0] !== 'nwc1') throw new Error('bad_seal');
  const iv = unb64u(parts[1]);
  const raw = unb64u(parts[2]);
  if (iv.length !== 12 || raw.length < 17) throw new Error('bad_seal');
  const ct = raw.subarray(0, raw.length - 16);
  const tag = raw.subarray(raw.length - 16);
  const d = createDecipheriv('aes-256-gcm', key, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]);
}

/** Builds the buyer bundle: transform (minify) → watermark → optional AES-GCM seal → per-file hashes of the PLAINTEXT → signed manifest. */
export async function buildBundle(privatePem: string, o: {
  moduleId: string; version: string; lid: string; licenseeId: string; files: BundleFile[];
  transform?: Transform;
  /** Closed-source default for subscriptions: encrypt each code file; returns contentKey for the license token. */
  seal?: boolean | Buffer;
}) {
  const key = o.seal === false || o.seal === undefined ? null : (Buffer.isBuffer(o.seal) ? o.seal : generateContentKey());
  const mark = encodeWatermark(o.licenseeId);
  const plainOut: BundleFile[] = [];
  const sealedOut: SealedFile[] = [];
  for (const f of o.files) {
    const isCode = /\.(m?js|ts|tsx)$/.test(f.path);
    let c = o.transform && isCode ? await o.transform(f.content, f.path) : f.content;
    const path = o.transform && isCode ? f.path.replace(/\.tsx?$/, '.js') : f.path;
    if (/\.m?js$/.test(path)) c = `${c}\n;void "${mark}";\n`;
    plainOut.push({ path, content: c });
    if (key && isCode) sealedOut.push({ path: path.endsWith('.enc') ? path : `${path}.enc`, sealed: sealBytes(key, c) });
  }
  const manifest: BundleManifest = {
    v: 1, moduleId: o.moduleId, version: o.version, lid: o.lid, watermark: sha256(o.licenseeId).slice(0, 16),
    sealed: Boolean(key),
    files: plainOut.map((f) => ({ path: f.path, sha256: sha256(f.content) })),
  };
  return {
    files: key ? sealedOut.map((s) => ({ path: s.path, content: s.sealed })) : plainOut,
    plainFiles: plainOut,
    manifest,
    signature: b64u(ed25519Sign(privatePem, canonicalJson(manifest))),
    contentKey: key ? contentKeyB64(key) : undefined,
  };
}

export type BundleCheck = { ok: true } | { ok: false; reason: 'bad_signature' | 'missing_file' | 'tampered' | 'extra_file' | 'no_key' | 'bad_seal'; path?: string };

/** Verifies a sealed or plain bundle. For sealed: supply contentKey and read returns the .enc payload; plaintext is checked against the manifest. */
export function verifyBundle(
  publicPem: string,
  manifest: BundleManifest,
  signature: string,
  read: (path: string) => string | null,
  listed?: string[],
  contentKey?: Buffer | null,
): BundleCheck {
  if (!ed25519Verify(publicPem, canonicalJson(manifest), unb64u(signature))) return { ok: false, reason: 'bad_signature' };
  for (const f of manifest.files) {
    if (manifest.sealed) {
      if (!contentKey || contentKey.length !== 32) return { ok: false, reason: 'no_key' };
      const encPath = `${f.path}.enc`;
      const sealed = read(encPath) ?? read(f.path);
      if (sealed === null) return { ok: false, reason: 'missing_file', path: encPath };
      let plain: Buffer;
      try { plain = openBytes(contentKey, sealed); } catch { return { ok: false, reason: 'bad_seal', path: encPath }; }
      if (sha256(plain) !== f.sha256) return { ok: false, reason: 'tampered', path: f.path };
    } else {
      const c = read(f.path);
      if (c === null) return { ok: false, reason: 'missing_file', path: f.path };
      if (sha256(c) !== f.sha256) return { ok: false, reason: 'tampered', path: f.path };
    }
  }
  const extra = listed?.find((p) => {
    const bare = p.replace(/\.enc$/, '');
    return !manifest.files.some((f) => f.path === bare || f.path === p);
  });
  return extra ? { ok: false, reason: 'extra_file', path: extra } : { ok: true };
}

/** Buyer boot helper: no valid key → refuse to decrypt (module does not load). */
export function decryptSealedFile(contentKey: Buffer | null | undefined, sealed: string): { ok: true; plain: string } | { ok: false; reason: 'no_key' | 'bad_seal' } {
  if (!contentKey || contentKey.length !== 32) return { ok: false, reason: 'no_key' };
  try { return { ok: true, plain: openBytes(contentKey, sealed).toString('utf8') }; }
  catch { return { ok: false, reason: 'bad_seal' }; }
}
