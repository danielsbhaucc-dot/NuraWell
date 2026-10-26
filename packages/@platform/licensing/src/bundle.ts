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

export type BundleFile = { path: string; content: string };
export type BundleManifest = { v: 1; moduleId: string; version: string; lid: string; watermark: string; files: { path: string; sha256: string }[] };
export type Transform = (code: string, path: string) => Promise<string> | string;

/** Builds the buyer bundle: transform (minify/obfuscate, injected) → watermark → per-file hashes → signed manifest. */
export async function buildBundle(privatePem: string, o: { moduleId: string; version: string; lid: string; licenseeId: string; files: BundleFile[]; transform?: Transform }) {
  const mark = encodeWatermark(o.licenseeId);
  const out: BundleFile[] = [];
  for (const f of o.files) {
    const isCode = /\.(m?js|ts|tsx)$/.test(f.path);
    let c = o.transform && isCode ? await o.transform(f.content, f.path) : f.content;
    const path = o.transform && isCode ? f.path.replace(/\.tsx?$/, '.js') : f.path;
    if (/\.m?js$/.test(path)) c = `${c}\n;void "${mark}";\n`;
    out.push({ path, content: c });
  }
  const manifest: BundleManifest = { v: 1, moduleId: o.moduleId, version: o.version, lid: o.lid, watermark: sha256(o.licenseeId).slice(0, 16), files: out.map((f) => ({ path: f.path, sha256: sha256(f.content) })) };
  return { files: out, manifest, signature: b64u(ed25519Sign(privatePem, canonicalJson(manifest))) };
}

export type BundleCheck = { ok: true } | { ok: false; reason: 'bad_signature' | 'missing_file' | 'tampered' | 'extra_file'; path?: string };
export function verifyBundle(publicPem: string, manifest: BundleManifest, signature: string, read: (path: string) => string | null, listed?: string[]): BundleCheck {
  if (!ed25519Verify(publicPem, canonicalJson(manifest), unb64u(signature))) return { ok: false, reason: 'bad_signature' };
  for (const f of manifest.files) {
    const c = read(f.path);
    if (c === null) return { ok: false, reason: 'missing_file', path: f.path };
    if (sha256(c) !== f.sha256) return { ok: false, reason: 'tampered', path: f.path };
  }
  const extra = listed?.find((p) => !manifest.files.some((f) => f.path === p));
  return extra ? { ok: false, reason: 'extra_file', path: extra } : { ok: true };
}
