import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { buildBundle, issueLicense, publicKeyPemFrom, type DistributionMode, type Transform } from '@platform/licensing';
import { tarGz } from './tar';
import type { RegistryModule } from '../types';
import { LICENSE_TERMS_DRAFT_HE } from './terms';

const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
/** Anything that looks like a credential blocks the package entirely (fail closed). */
export const SECRET_PATTERNS = [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, /\bsk_(live|test)_[A-Za-z0-9]{8,}/, /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/, /:\/\/[^/\s:@]+:[^@\s]+@/, /\b(AKIA|ASIA)[A-Z0-9]{16}\b/, /\bgh[pousr]_[A-Za-z0-9]{30,}/, /\bxox[abp]-[A-Za-z0-9-]{10,}/];
export const DENY_PATH = /(^|\/)(\.env[^/]*|node_modules|\.next|dist|secrets?|[^/]*\.(pem|key|p12|pfx|crt)|id_[a-z0-9]+)(\/|$)/i;

export type PackResult = { ok: true; fileName: string; bytes: Buffer; sha256: string; files: string[]; lid?: string; expiresAt?: string | null } | { ok: false; error: string };
type Files = { path: string; content: string }[];

export function readModuleFiles(root: string, m: RegistryModule): Files | string {
  const out: Files = [];
  for (const p of m.files) {
    if (DENY_PATH.test(p)) return `נחסם קובץ אסור: ${p}`;
    let c: string;
    try { c = readFileSync(join(root, m.dir, p), 'utf8'); } catch { return 'קובצי המודול לא זמינים בשרת הזה.'; }
    if (SECRET_PATTERNS.some((r) => r.test(c))) return `נמצא משהו שנראה כמו סוד בקובץ ${p}, החבילה לא נוצרה.`;
    out.push({ path: p, content: c });
  }
  return out;
}

function integrity(files: { path: string; content: string | Buffer }[]) {
  const list = files.map((f) => ({ path: f.path, sha256: sha(f.content) }));
  return { list, root: sha(list.map((f) => `${f.sha256}  ${f.path}`).join('\n')) };
}

/** 'שיתוף': the module as-is (source), docs, and an integrity file. No keys, no env. */
export function sharePackage(files: Files, m: RegistryModule): PackResult {
  if (m.distribution === 'internal') return { ok: false, error: 'מודול פנימי לא יוצא מהמערכת.' };
  const prefix = `${m.id}-${m.version}`;
  const inner = files.map((f) => ({ path: `${prefix}/${f.path}`, content: f.content }));
  const integ = integrity(inner);
  inner.push({ path: `${prefix}/INTEGRITY.json`, content: JSON.stringify({ moduleId: m.id, version: m.version, root: integ.root, files: integ.list }, null, 1) });
  const bytes = tarGz(inner);
  return { ok: true, fileName: `${prefix}-share.tgz`, bytes, sha256: sha(bytes), files: inner.map((f) => f.path) };
}

export type SellInput = { privatePem: string | null; licensee: { id: string; name: string }; domains: string[]; validDays: number | null; mode: DistributionMode; transform?: Transform; revocationUrl?: string };

/** 'מכירה': signed license + (bundle: minified, watermarked, signed manifest) or (source: full source). */
export async function sellPackage(files: Files, m: RegistryModule, s: SellInput, now = new Date()): Promise<PackResult> {
  if (m.distribution !== 'sellable') return { ok: false, error: 'רק מודול שמסומן "למכירה" אפשר למכור.' };
  if (!s.privatePem) return { ok: false, error: 'מפתח החתימה לרישיונות עוד לא הוגדר, ולכן אי אפשר למכור כרגע.' };
  if (s.mode === 'source' && !m.sale?.modes.includes('source')) return { ok: false, error: 'למודול הזה אין אפשרות קנייה של קוד מלא.' };
  const prefix = `${m.id}-${m.version}`;
  const { token, license } = issueLicense(s.privatePem, { moduleId: m.id, versionRange: `^${m.version}`, licensee: s.licensee, domains: s.domains, mode: s.mode, validDays: s.mode === 'bundle' ? (s.validDays ?? 30) : s.validDays }, now);
  const pub = publicKeyPemFrom(s.privatePem);
  let payload: Files;
  const extra: Files = [];
  if (s.mode === 'bundle') {
    const code = files.filter((f) => /\.(ts|tsx|mjs|js)$/.test(f.path));
    const docs = files.filter((f) => !code.includes(f));
    const b = await buildBundle(s.privatePem, { moduleId: m.id, version: m.version, lid: license.lid, licenseeId: s.licensee.id, files: code, transform: s.transform });
    payload = [...b.files, ...docs];
    extra.push({ path: 'BUNDLE-MANIFEST.json', content: JSON.stringify(b.manifest, null, 1) }, { path: 'BUNDLE-MANIFEST.sig', content: b.signature });
  } else payload = files;
  extra.push(
    { path: 'LICENSE.token', content: token },
    { path: 'license-public-key.pem', content: pub },
    { path: 'LICENSE-TERMS.he.md', content: LICENSE_TERMS_DRAFT_HE },
    { path: 'license.config.json', content: JSON.stringify({ moduleId: m.id, licenseToken: 'LICENSE.token', revocationUrl: s.revocationUrl ?? null, pollHours: 6 }, null, 1) },
  );
  const inner = [...payload, ...extra].map((f) => ({ path: `${prefix}/${f.path}`, content: f.content }));
  const integ = integrity(inner);
  inner.push({ path: `${prefix}/INTEGRITY.json`, content: JSON.stringify({ moduleId: m.id, version: m.version, root: integ.root, files: integ.list }, null, 1) });
  const bytes = tarGz(inner);
  return { ok: true, fileName: `${prefix}-${s.mode}-${license.lid}.tgz`, bytes, sha256: sha(bytes), files: inner.map((f) => f.path), lid: license.lid, expiresAt: license.expiresAt };
}
