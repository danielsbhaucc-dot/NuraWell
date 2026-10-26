// Central control plane (platform-central DB). Server-only. The `central` schema is private (not exposed by the Data API),
// so everything goes through a handful of service_role-only RPCs (supabase-central/migrations/000003).
import { DEFAULT_GRACE_DAYS, type License, type RevocationEntry } from '@platform/licensing';
import type { LicenseStore } from './actions';
import type { LicenseRow } from '../types';

type Rpc = { rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }> };

export type CentralLicense = { lid: string; moduleId: string; productId: string | null; licensee: string; mode: 'bundle' | 'source' | 'product'; domains: string[]; issuedAt: string; expiresAt: string | null; graceDays: number; state: LicenseRow['state']; until: string | null };
export type CentralSnapshot = {
  products: { id: string; name: string; status: 'active' | 'disabled' | 'planned'; description: string | null }[];
  modules: { id: string; name: string; core: boolean; dependsOn: string[] }[];
  states: { productId: string; moduleId: string; enabled: boolean }[];
  licenses: CentralLicense[];
  statusVersion: number;
};

/** Both env vars set = the hub reads from the central DB. Missing = falls back to the product DB (nothing breaks). */
export function centralConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.CENTRAL_SUPABASE_URL && env.CENTRAL_SUPABASE_SECRET_KEY);
}

/** One call, all hub data. Throws a generic error (never the DB message) so the caller can fall back. */
export async function loadCentralSnapshot(db: Rpc): Promise<CentralSnapshot> {
  const { data, error } = await db.rpc('central_hub_snapshot');
  if (error || !data || typeof data !== 'object') throw new Error('central_unavailable');
  return data as CentralSnapshot;
}

/** The sample product (and every future product) registers its instance. Only an opaque id + sha256 of the host are stored. */
export async function registerInstance(db: Rpc, a: { productId: string; instanceId: string; hostSha256: string | null }) {
  const { data, error } = await db.rpc('central_register_instance', { p_product: a.productId, p_instance: a.instanceId, p_host_sha256: a.hostSha256 });
  if (error) throw new Error('central_register_failed');
  return data as { instanceId: string; productStatus: string };
}

const toRow = (l: CentralLicense): LicenseRow => ({ lid: l.lid, moduleId: l.moduleId, licensee: l.licensee, mode: l.mode === 'source' ? 'source' : 'bundle', domains: l.domains, issuedAt: l.issuedAt, expiresAt: l.expiresAt, state: l.state, until: l.until });

/** LicenseStore over the central DB. Same contract as supabaseLicenseStore, so the hub actions don't change. */
export function centralLicenseStore(db: Rpc, opts: { productId?: string | null } = {}): LicenseStore {
  const must = (r: { error: { message: string } | null }) => { if (r.error) throw new Error('license_store_failed'); };
  const snap = () => loadCentralSnapshot(db);
  return {
    async saveLicense(l: License, nameEnc, actorId, supersedes) {
      const lid = supersedes ? `${l.lid}~${Date.parse(l.issuedAt).toString(36)}` : l.lid;
      must(await db.rpc('central_save_license', { p_actor: actorId || null, p_supersedes: supersedes ?? null, p_license: {
        lid, productId: opts.productId ?? null, moduleId: l.moduleId, versionRange: l.versionRange, licenseeRef: l.licensee.id, licenseeNameEnc: nameEnc,
        domains: l.domains, mode: l.mode, issuedAt: l.issuedAt, expiresAt: l.expiresAt, graceDays: l.graceDays ?? DEFAULT_GRACE_DAYS } }));
    },
    async getLicense(lid) {
      // Renewals are history rows (`${lid}~…`); the snapshot only returns the live row per buyer-facing lid.
      const l = (await snap()).licenses.find((x) => x.lid === lid);
      if (!l) return null;
      return { v: 1, lid, moduleId: l.moduleId, versionRange: '*', licensee: { id: l.licensee, name: l.licensee }, domains: l.domains, mode: l.mode === 'source' ? 'source' : 'bundle', issuedAt: l.issuedAt, expiresAt: l.expiresAt, graceDays: l.graceDays } satisfies License;
    },
    async list() { return (await snap()).licenses.map(toRow); },
    async setRevocation(lid, e, actorId) { must(await db.rpc('central_set_license_status', { p_actor: actorId || null, p_lid: lid, p_state: e.state, p_until: e.until, p_reason_enc: e.reasonEnc, p_reason_code: e.reasonCode ?? null })); },
    async clearRevocation(lid) { must(await db.rpc('central_set_license_status', { p_actor: null, p_lid: lid, p_state: 'active', p_until: null, p_reason_enc: null, p_reason_code: null })); },
    async revocations(): Promise<RevocationEntry[]> {
      return (await snap()).licenses.filter((l) => l.state !== 'active').map((l) => ({ lid: l.lid, state: l.state as RevocationEntry['state'], ...(l.until ? { until: l.until } : {}) }));
    },
    async bumpVersion() { const r = await db.rpc('central_bump_status_version'); must(r); return Number(r.data); },
  };
}
