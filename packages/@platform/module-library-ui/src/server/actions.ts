import { renewLicense, signRevocationList, type License, type RevocationEntry, type RevocationPublisher, type RevocationState, type Transform, type DistributionMode } from '@platform/licensing';
import type { RegistryModule, LicenseRow } from '../types';
import { readModuleFiles, sellPackage, sharePackage } from './pack';

export type Audit = (kind: string, target: string | null, detail: Record<string, unknown>) => Promise<void>;
export type Gate = () => Promise<{ ok: true; actorId: string } | { ok: false; status: number; error: string }>;
/** Persistence for issued licenses + revocations (gated migration 000216). Reasons arrive already encrypted. */
export interface LicenseStore {
  saveLicense(l: License, licenseeNameEnc: string | null, actorId: string, supersedes?: string): Promise<void>;
  getLicense(lid: string): Promise<License | null>;
  list(): Promise<LicenseRow[]>;
  setRevocation(lid: string, e: { state: RevocationState; until: string | null; reasonEnc: string | null }, actorId: string): Promise<void>;
  clearRevocation(lid: string): Promise<void>;
  revocations(): Promise<RevocationEntry[]>;
  bumpVersion(): Promise<number>;
}
export type Deps = {
  registry: RegistryModule[]; root: string; gate: Gate; audit: Audit;
  privatePem: string | null; transform?: Transform; revocationUrl?: string;
  store: LicenseStore | null; publisher: RevocationPublisher | null; encrypt: (rowId: string, v: string) => Promise<string>;
};
export type Out = { status: number; body: Record<string, unknown> };
const err = (status: number, error: string): Out => ({ status, body: { error } });
const NO_KEY = 'מפתח החתימה לרישיונות עוד לא הוגדר בשרת, ולכן מכירה ורישיונות כבויים כרגע.';
const NO_STORE = 'טבלאות הרישוי עוד לא הופעלו במסד הנתונים (מיגרציה 000216 ממתינה לאישור).';

type PkgBody = { kind: 'share' | 'sell'; moduleId: string; licenseeName?: string; licenseeRef?: string; domains?: string[]; validDays?: number | null; mode?: DistributionMode };

export async function packageAction(d: Deps, b: PkgBody): Promise<Out> {
  const g = await d.gate();
  if (!g.ok) return err(g.status, g.error);
  const m = d.registry.find((x) => x.id === b.moduleId);
  if (!m) return err(404, 'מודול לא מוכר.');
  const files = readModuleFiles(d.root, m);
  if (typeof files === 'string') { await d.audit('module_package_refused', m.id, { kind: b.kind }); return err(422, files); }
  if (b.kind === 'share') {
    const r = sharePackage(files, m);
    if (!r.ok) return err(422, r.error);
    await d.audit('module_shared', m.id, { version: m.version, sha256: r.sha256, files: r.files.length });
    return { status: 200, body: { fileName: r.fileName, sha256: r.sha256, files: r.files, base64: r.bytes.toString('base64') } };
  }
  if (!d.privatePem) return err(503, NO_KEY);
  if (!d.store) return err(503, NO_STORE);
  const domains = (b.domains ?? []).map((x) => x.trim().toLowerCase()).filter(Boolean);
  const ref = (b.licenseeRef ?? '').trim();
  if (!ref || !/^[a-z0-9-]{3,40}$/.test(ref)) return err(400, 'מזהה לקוח צריך להיות 3–40 תווים: אותיות קטנות באנגלית, ספרות ומקף.');
  const mode = b.mode ?? 'bundle';
  if (mode === 'bundle' && domains.length === 0) return err(400, 'צריך לפחות דומיין אחד לרישיון.');
  const r = await sellPackage(files, m, { privatePem: d.privatePem, licensee: { id: ref, name: ref }, domains, validDays: b.validDays ?? 30, mode, transform: d.transform, revocationUrl: d.revocationUrl });
  if (!r.ok) return err(422, r.error);
  const lic: License = { v: 1, lid: r.lid!, moduleId: m.id, versionRange: `^${m.version}`, licensee: { id: ref, name: ref }, domains, mode, issuedAt: new Date().toISOString(), expiresAt: r.expiresAt ?? null };
  await d.store.saveLicense(lic, b.licenseeName ? await d.encrypt(lic.lid, b.licenseeName.slice(0, 120)) : null, g.actorId);
  await d.audit('license_issued', m.id, { lid: lic.lid, mode, domains: domains.length, expiresAt: lic.expiresAt });
  return { status: 200, body: { fileName: r.fileName, sha256: r.sha256, files: r.files, lid: lic.lid, expiresAt: lic.expiresAt, base64: r.bytes.toString('base64') } };
}

type LicBody = { op: 'list' } | { op: 'renew'; lid: string; validDays?: number } | { op: 'revoke'; lid: string; state: RevocationState; until?: string | null; reason: string } | { op: 'reinstate'; lid: string } | { op: 'publish' };

async function publish(d: Deps): Promise<Out | null> {
  if (!d.publisher) return err(503, 'לא הוגדר יעד לפרסום רשימת החסימות.');
  const version = await d.store!.bumpVersion();
  const doc = signRevocationList(d.privatePem!, { version, issuedAt: new Date().toISOString(), entries: await d.store!.revocations() });
  const p = await d.publisher.publish(doc);
  if (!p.ok) return err(502, 'פרסום רשימת החסימות נכשל. השינוי נשמר ויפורסם בפעם הבאה.');
  await d.audit('revocation_list_published', null, { version, entries: doc.list.entries.length, adapter: d.publisher.name });
  return null;
}

export async function licenseAction(d: Deps, b: LicBody): Promise<Out> {
  const g = await d.gate();
  if (!g.ok) return err(g.status, g.error);
  if (!d.store) return err(503, NO_STORE);
  if (b.op === 'list') return { status: 200, body: { licenses: await d.store.list(), signingReady: Boolean(d.privatePem) } };
  if (!d.privatePem) return err(503, NO_KEY);
  if (b.op === 'publish') return (await publish(d)) ?? { status: 200, body: { ok: true } };
  const old = await d.store.getLicense(b.lid);
  if (!old) return err(404, 'רישיון לא נמצא.');
  if (b.op === 'renew') {
    const { token, license } = renewLicense(d.privatePem, old, Math.min(Math.max(b.validDays ?? 30, 1), 365));
    await d.store.saveLicense(license, null, g.actorId, old.lid);
    await d.audit('license_renewed', old.moduleId, { lid: old.lid, expiresAt: license.expiresAt });
    return { status: 200, body: { token, expiresAt: license.expiresAt } };
  }
  if (b.op === 'revoke') {
    if (b.state === 'suspended_until' && !(b.until && !Number.isNaN(Date.parse(b.until)))) return err(400, 'להשעיה זמנית צריך תאריך סיום.');
    if (!b.reason?.trim()) return err(400, 'צריך לכתוב סיבה (נשמרת מוצפנת, רק אצלנו).');
    await d.store.setRevocation(b.lid, { state: b.state, until: b.state === 'suspended_until' ? new Date(b.until!).toISOString() : null, reasonEnc: await d.encrypt(b.lid, b.reason.slice(0, 500)) }, g.actorId);
    await d.audit('license_revoked', old.moduleId, { lid: b.lid, state: b.state });
  } else {
    await d.store.clearRevocation(b.lid);
    await d.audit('license_reinstated', old.moduleId, { lid: b.lid });
  }
  return (await publish(d)) ?? { status: 200, body: { ok: true } };
}

/** Registry says alwaysOn (toggleable:false) → refuse turning it off, before the IAM catalog check. */
export function registryLocked(registry: RegistryModule[], iamModuleId: string, enabled: boolean): boolean {
  return !enabled && registry.some((m) => m.store.iamModule === iamModuleId && !m.toggleable);
}
