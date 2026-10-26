import type { License, RevocationEntry } from '@platform/licensing';
import type { LicenseStore } from './actions';
import type { LicenseRow } from '../types';
type Db = { from(t: string): any; rpc(fn: string): any }; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Store over the gated 000216 tables. Returns null when they don't exist yet (fail closed with a clear message). */
export async function supabaseLicenseStore(db: Db): Promise<LicenseStore | null> {
  const probe = await db.from('platform_licenses').select('lid', { head: true, count: 'exact' }).limit(1);
  if (probe.error) return null;
  const must = (r: { error: { message: string } | null }) => { if (r.error) throw new Error('license_store_failed'); };
  return {
    async saveLicense(l, nameEnc, actorId, supersedes) {
      must(await db.from('platform_licenses').insert({ lid: supersedes ? `${l.lid}~${Date.parse(l.issuedAt).toString(36)}` : l.lid, module_id: l.moduleId, version_range: l.versionRange, licensee_ref: l.licensee.id, licensee_name_enc: nameEnc, domains: l.domains, mode: l.mode, issued_at: l.issuedAt, expires_at: l.expiresAt, issued_by: actorId }));
      if (supersedes) must(await db.from('platform_licenses').update({ expires_at: l.expiresAt, issued_at: l.issuedAt }).eq('lid', supersedes));
    },
    async getLicense(lid) {
      const { data } = await db.from('platform_licenses').select('*').eq('lid', lid).maybeSingle();
      if (!data) return null;
      return { v: 1, lid: data.lid, moduleId: data.module_id, versionRange: data.version_range, licensee: { id: data.licensee_ref, name: data.licensee_ref }, domains: data.domains, mode: data.mode, issuedAt: data.issued_at, expiresAt: data.expires_at } satisfies License;
    },
    async list() {
      const [{ data: ls }, { data: rs }] = await Promise.all([db.from('platform_licenses').select('lid, module_id, licensee_ref, mode, domains, issued_at, expires_at').not('lid', 'like', '%~%').order('issued_at', { ascending: false }).limit(500), db.from('platform_license_revocations').select('lid, state, until')]);
      return ((ls ?? []) as any[]).map((l): LicenseRow => { const r = ((rs ?? []) as any[]).find((x) => x.lid === l.lid); return { lid: l.lid, moduleId: l.module_id, licensee: l.licensee_ref, mode: l.mode, domains: l.domains, issuedAt: l.issued_at, expiresAt: l.expires_at, state: r?.state ?? 'active', until: r?.until ?? null }; }); // eslint-disable-line @typescript-eslint/no-explicit-any
    },
    async setRevocation(lid, e, actorId) { must(await db.from('platform_license_revocations').upsert({ lid, state: e.state, until: e.until, reason_enc: e.reasonEnc, updated_by: actorId, updated_at: new Date().toISOString() })); },
    async clearRevocation(lid) { must(await db.from('platform_license_revocations').delete().eq('lid', lid)); },
    async revocations() {
      const { data } = await db.from('platform_license_revocations').select('lid, state, until');
      return ((data ?? []) as { lid: string; state: RevocationEntry['state']; until: string | null }[]).map((r) => (r.until ? { lid: r.lid, state: r.state, until: r.until } : { lid: r.lid, state: r.state }));
    },
    async bumpVersion() { const r = await db.rpc('platform_bump_revocation_version'); must(r); return Number(r.data); },
  };
}
