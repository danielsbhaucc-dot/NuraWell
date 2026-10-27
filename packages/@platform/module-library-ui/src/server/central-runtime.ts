// How a running product (NuraWell itself, like the sample product) consumes its module states + license from central.
// Rules:
//  * Core modules are ALWAYS on, whatever happens (central down, license locked, product disabled). Users and the
//    core app are never locked out; only non-core modules can turn off.
//  * States are cached ~2 minutes. If central can't be reached, the last verified states keep working for up to 6 hours;
//    after that non-core modules fail closed (off) until central answers again.
//  * Ownership (central.products.owned_by_us, with a local `ownedByUs` fallback when central is unreachable):
//    - OWNED (our own products): a license lock / licensing outage NEVER turns a module off. It only raises `licenseAlert`
//      for admins. Manual toggles still apply.
//    - CUSTOMER products: a non-core module works only if it is toggled on AND has an active entitlement:
//      'perpetual' → forever; 'subscription' → until paid_through + grace_days. Fail closed: no central and no cache → off,
//      and the gate blocks (see `failClosed`).
import type { GuardStatus } from '@platform/licensing';

type Rpc = { rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }> };
export type RuntimeModuleState = { productId: string; moduleId: string; enabled: boolean };
export type RuntimeSource = 'central' | 'cache' | 'failsafe';
export type LicenseType = 'subscription' | 'perpetual';
export type Entitlement = { moduleId: string; licenseType: LicenseType; source?: 'purchase' | 'grant'; paidThrough?: string | null; graceDays?: number; updatesUntil?: string | null; active?: boolean; revoked?: boolean; status?: 'active' | 'past_due' | 'expired' | 'canceled' };
export type RuntimeResult = { states: RuntimeModuleState[]; userStates: RuntimeModuleState[]; source: RuntimeSource; ownedByUs: boolean; failClosed: boolean; licenseAlert: boolean; entitlements: Entitlement[]; license: GuardStatus['state'] | 'not_configured'; productStatus: string | null };
type Snap = { productStatus: string | null; ownedByUs?: boolean; core: string[]; states: { moduleId: string; enabled: boolean }[]; entitlements?: Entitlement[] };

/** Re-evaluated locally so a cached snapshot still expires subscriptions on time. */
export function entitlementActive(e: Entitlement, nowMs: number): boolean {
  if (e.revoked || e.status === 'expired' || e.status === 'canceled') return false;
  if (e.licenseType === 'perpetual') return true;
  if (!e.paidThrough) return false;
  const until = Date.parse(e.paidThrough) + (e.graceDays ?? 3) * 86_400_000;
  return Number.isFinite(until) && nowMs <= until;
}

export const RUNTIME_POLL_MS = 2 * 60_000;
export const RUNTIME_MAX_STALE_MS = 6 * 60 * 60_000;

export async function loadCentralModuleStates(db: Rpc, productId: string): Promise<Snap> {
  const { data, error } = await db.rpc('central_module_states', { p_product: productId });
  if (error || !data || typeof data !== 'object' || !Array.isArray((data as Snap).states)) throw new Error('central_unavailable');
  return data as Snap;
}

export function createCentralModuleSource(o: {
  db: Rpc; productId: string; coreIds: readonly string[];
  license?: { status(): Promise<GuardStatus> } | null;
  /** Local fallback for ownership when central can't be read. Central's value wins when present. */
  ownedByUs?: boolean;
  now?: () => number; pollMs?: number; maxStaleMs?: number;
}) {
  const now = o.now ?? Date.now, pollMs = o.pollMs ?? RUNTIME_POLL_MS, maxStale = o.maxStaleMs ?? RUNTIME_MAX_STALE_MS;
  let last: { snap: Snap; at: number } | null = null;

  async function snapshot(fresh: boolean): Promise<{ snap: Snap | null; source: RuntimeSource }> {
    if (!fresh && last && now() - last.at < pollMs) return { snap: last.snap, source: 'central' };
    try {
      const snap = await loadCentralModuleStates(o.db, o.productId);
      last = { snap, at: now() };
      return { snap, source: 'central' };
    } catch {
      if (last && now() - last.at <= maxStale) return { snap: last.snap, source: 'cache' };
      return { snap: null, source: 'failsafe' };
    }
  }

  return {
    /** Never throws. `fresh` skips the 2-minute cache (use after a write or on the admin screen). */
    async get(opts: { fresh?: boolean } = {}): Promise<RuntimeResult> {
      const { snap, source } = await snapshot(Boolean(opts.fresh));
      let lic: RuntimeResult['license'] = 'not_configured';
      if (o.license) { try { lic = (await o.license.status()).state; } catch { lic = 'locked'; } }
      const core = new Set([...o.coreIds, ...(snap?.core ?? [])]);
      const live = Boolean(snap) && snap!.productStatus !== 'disabled';
      const licOk = lic === 'active' || lic === 'not_configured';
      const ids = new Set([...core, ...(snap?.states ?? []).map((s) => s.moduleId)]);
      const owned = snap?.ownedByUs ?? o.ownedByUs ?? false;
      const ents = snap?.entitlements ?? [];
      const entitled = new Set(ents.filter((e) => entitlementActive(e, now())).map((e) => e.moduleId));
      const build = (allow: (id: string) => boolean) => [...ids].map((moduleId) => ({
        productId: o.productId, moduleId,
        enabled: core.has(moduleId) || (allow(moduleId) && Boolean(snap!.states.find((s) => s.moduleId === moduleId)?.enabled)),
      }));
      const states = owned ? build(() => live) : build((id) => live && licOk && entitled.has(id));
      return { states, userStates: states, source, ownedByUs: owned, failClosed: !owned, licenseAlert: owned && !licOk, entitlements: ents, license: lic, productStatus: snap?.productStatus ?? null };
    },
    invalidate() { if (last) last = { ...last, at: -Infinity }; },
  };
}

/** One-time, idempotent copy of the product's own module table into central (central refuses a second run). */
export async function syncModulesToCentral(db: Rpc, a: { actorId: string | null; productId: string; rows: { moduleId: string; enabled: boolean }[] }) {
  const { data, error } = await db.rpc('central_sync_module_states', { p_actor: a.actorId, p_product: a.productId, p_rows: a.rows });
  if (error) throw new Error('central_sync_failed');
  return data as { skipped: boolean; rows?: number; syncedAt?: string };
}

/** Module on/off goes to central only (single source of truth). DB-side guards: actor required, core stays on, dependencies on. */
export async function setCentralModuleState(db: Rpc, a: { actorId: string; productId: string; moduleId: string; enabled: boolean }): Promise<{ ok: true } | { ok: false; reason: 'dependency_disabled' | 'central_refused' }> {
  const { error } = await db.rpc('central_set_module_state', { p_actor: a.actorId, p_product: a.productId, p_module: a.moduleId, p_enabled: a.enabled });
  if (!error) return { ok: true };
  return { ok: false, reason: /dependency_disabled/.test(error.message) ? 'dependency_disabled' : 'central_refused' };
}
