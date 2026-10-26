import { signStatusUpdate, type StatusPusher } from '@platform/licensing/online';
import type { GatewayAdmin } from '@platform/licensing/gateway';
/** One install per license in the server-held-core gateway. */
export const installIdFor = (lid: string) => `ins_${lid.replace(/[^A-Za-z0-9_-]/g, '')}`;
import { PUBLIC_REASON_CODES, renewLicense, signRevocationList, type License, type RevocationEntry, type RevocationPublisher, type RevocationState, type Transform, type DistributionMode } from '@platform/licensing';
import type { RegistryModule, LicenseRow } from '../types';
import { readModuleFiles, sellPackage, sharePackage } from './pack';

export type Audit = (kind: string, target: string | null, detail: Record<string, unknown>) => Promise<void>;
export type Gate = () => Promise<{ ok: true; actorId: string } | { ok: false; status: number; error: string }>;
/** Persistence for issued licenses + revocations (gated migration 000216). Reasons arrive already encrypted. */
export interface LicenseStore {
  saveLicense(l: License, licenseeNameEnc: string | null, actorId: string, supersedes?: string): Promise<void>;
  getLicense(lid: string): Promise<License | null>;
  list(): Promise<LicenseRow[]>;
  setRevocation(lid: string, e: { state: RevocationState; until: string | null; reasonEnc: string | null; reasonCode?: ReasonCode }, actorId: string): Promise<void>;
  clearRevocation(lid: string): Promise<void>;
  revocations(): Promise<RevocationEntry[]>;
  bumpVersion(): Promise<number>;
}
export type Deps = {
  registry: RegistryModule[]; root: string; gate: Gate; audit: Audit;
  privatePem: string | null; transform?: Transform; revocationUrl?: string;
  store: LicenseStore | null; publisher: RevocationPublisher | null;
  /** Optional: shared Worker only for modules with sensitive server-side logic. */
  statusPusher?: StatusPusher | null;
  /** Server-held core (default protection for sold modules): shared Worker store admin. Null until the Worker store is wired. */
  gateway?: GatewayAdmin | null; verifierUrl?: string; verifierPublicKeyPem?: string; encrypt: (rowId: string, v: string) => Promise<string>;
};
export type Out = { status: number; body: Record<string, unknown> };
const err = (status: number, error: string): Out => ({ status, body: { error } });
const NO_KEY = 'המכירה עוד לא הופעלה: מפתח החתימה לא הוגדר בשרת. אחרי הפעלה חד־פעמית זה יעבוד כאן.';
const NO_STORE = 'הרישיונות עוד לא הופעלו במערכת (ממתין לאישור). אחרי ההפעלה זה יעבוד כאן.';

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
  if (!ref || !/^[a-z0-9-]{3,40}$/.test(ref)) return err(400, 'צריך כתובת אתר תקינה של הקונה, למשל shop.example.com.');
  const mode = b.mode ?? 'bundle';
  if (mode === 'bundle' && domains.length === 0) return err(400, 'צריך את כתובת האתר של הקונה.');
  const r = await sellPackage(files, m, { privatePem: d.privatePem, licensee: { id: ref, name: ref }, domains, validDays: b.validDays ?? 30, mode, transform: d.transform, revocationUrl: d.revocationUrl, verifierUrl: d.verifierUrl, verifierPublicKeyPem: d.verifierPublicKeyPem });
  if (!r.ok) return err(422, r.error);
  const lic: License = { v: 1, lid: r.lid!, moduleId: m.id, versionRange: `^${m.version}`, licensee: { id: ref, name: ref }, domains, mode, issuedAt: new Date().toISOString(), expiresAt: r.expiresAt ?? null };
  await d.store.saveLicense(lic, b.licenseeName ? await d.encrypt(lic.lid, b.licenseeName.slice(0, 120)) : null, g.actorId);
  await d.audit('license_issued', m.id, { lid: lic.lid, mode, domains: domains.length, expiresAt: lic.expiresAt });
  const access = d.gateway ? await d.gateway.issue({ lid: lic.lid, moduleId: m.id, domains, iid: installIdFor(lic.lid) }) : null;
  if (access) await d.audit('license_install_issued', m.id, { lid: lic.lid, keyVersion: access.keyVersion });
  return { status: 200, body: { ...(access ? { installId: access.iid, secret: access.secret, keyVersion: access.keyVersion } : {}), fileName: r.fileName, sha256: r.sha256, files: r.files, lid: lic.lid, expiresAt: lic.expiresAt, base64: r.bytes.toString('base64') } };
}

export const REASON_CODES = PUBLIC_REASON_CODES;
export type ReasonCode = (typeof PUBLIC_REASON_CODES)[number];
type LicBody = { op: 'list' } | { op: 'renew'; lid: string; validDays?: number } | { op: 'revoke'; lid: string; state: RevocationState; until?: string | null; reason: string; reasonCode?: ReasonCode } | { op: 'reinstate'; lid: string } | { op: 'rotate'; lid: string } | { op: 'publish' };

/** Bumps the monotonic version once, re-signs and publishes the static status file (primary path, no Worker per check). Optional: also push to the shared Worker for modules with server-side logic. */
async function publish(d: Deps, change?: { lid: string; state: RevocationState | 'active'; until?: string | null }): Promise<Out | null> {
  if (!d.publisher) return err(503, 'לא הוגדר לאן לפרסם את קובץ הסטטוס.');
  const version = await d.store!.bumpVersion();
  let pushed: boolean | null = null;
  if (change && d.statusPusher) {
    const u = await signStatusUpdate(d.privatePem!, { lid: change.lid, state: change.state, seq: version, ...(change.until ? { until: change.until } : {}) });
    pushed = (await d.statusPusher.push(u)).ok;
    await d.audit('license_status_pushed', null, { lid: change.lid, state: change.state, seq: version, ok: pushed, adapter: d.statusPusher.name });
  }
  {
    const doc = signRevocationList(d.privatePem!, { version, issuedAt: new Date().toISOString(), entries: await d.store!.revocations() });
    const p = await d.publisher!.publish(doc);
    if (!p.ok) return err(502, 'השינוי נשמר, אבל הפרסום נכשל. נסו שוב בעוד רגע.');
    await d.audit('revocation_list_published', null, { version, entries: doc.list.entries.length, adapter: d.publisher!.name });
  }
  if (pushed === false) return err(502, 'קובץ הסטטוס פורסם, אבל העדכון לשרת הבדיקה המשותף נכשל. נסו שוב בעוד רגע.');
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
  if (b.op === 'rotate') {
    if (!d.gateway) return err(503, 'שרת הליבה עוד לא חובר, אין מפתח להחליף.');
    const r = await d.gateway.rotate(installIdFor(b.lid));
    if (!r) return err(404, 'לרישיון הזה אין התקנה מוגנת.');
    await d.audit('license_key_rotated', old.moduleId, { lid: b.lid, keyVersion: r.keyVersion });
    return { status: 200, body: { installId: r.iid, secret: r.secret, keyVersion: r.keyVersion } };
  }
  if (b.op === 'revoke') {
    if (b.state === 'suspended_until' && !(b.until && !Number.isNaN(Date.parse(b.until)))) return err(400, 'להשעיה זמנית צריך תאריך סיום.');
    if (!b.reason?.trim()) return err(400, 'צריך לבחור סיבה.');
    const until = b.state === 'suspended_until' ? new Date(b.until!).toISOString() : null;
    const reasonCode: ReasonCode = REASON_CODES.includes(b.reasonCode as ReasonCode) ? b.reasonCode! : 'other';
    await d.store.setRevocation(b.lid, { state: b.state, until, reasonEnc: await d.encrypt(b.lid, b.reason.slice(0, 500)), reasonCode }, g.actorId);
    await d.gateway?.setStatus(installIdFor(b.lid), { state: b.state, until, reason: reasonCode });
    await d.audit('license_blocked', old.moduleId, { lid: b.lid, state: b.state, until, reasonCode }); // reason code only: no free text, no PII
    return (await publish(d, { lid: b.lid, state: b.state, until })) ?? { status: 200, body: { ok: true } };
  }
  await d.store.clearRevocation(b.lid);
  await d.gateway?.setStatus(installIdFor(b.lid), { state: 'active' });
  await d.audit('license_unblocked', old.moduleId, { lid: b.lid });
  return (await publish(d, { lid: b.lid, state: 'active' })) ?? { status: 200, body: { ok: true } };
}

/** Registry says alwaysOn (toggleable:false) → refuse turning it off, before the IAM catalog check. */
export function registryLocked(registry: RegistryModule[], iamModuleId: string, enabled: boolean): boolean {
  return !enabled && registry.some((m) => m.store.iamModule === iamModuleId && !m.toggleable);
}
