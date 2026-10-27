// How a running product (NuraWell itself, like the sample product) consumes its module states + license from central.
// Rules:
//  * Core modules are ALWAYS on, whatever happens (central down, license locked, product disabled). Users and the
//    core app are never locked out; only non-core modules can turn off.
//  * States are cached ~2 minutes. If central can't be reached, the last verified states keep working for up to 6 hours;
//    after that non-core modules fail closed (off) until central answers again.
//  * Optional license guard (same @platform/licensing guard as the sample product): if it isn't 'active', non-core modules are off.
import type { GuardStatus } from '@platform/licensing';

type Rpc = { rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }> };
export type RuntimeModuleState = { productId: string; moduleId: string; enabled: boolean };
export type RuntimeSource = 'central' | 'cache' | 'failsafe';
export type RuntimeResult = { states: RuntimeModuleState[]; source: RuntimeSource; license: GuardStatus['state'] | 'not_configured'; productStatus: string | null };
type Snap = { productStatus: string | null; core: string[]; states: { moduleId: string; enabled: boolean }[] };

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
      const nonCoreAllowed = Boolean(snap) && snap!.productStatus !== 'disabled' && (lic === 'active' || lic === 'not_configured');
      const ids = new Set([...core, ...(snap?.states ?? []).map((s) => s.moduleId)]);
      const states = [...ids].map((moduleId) => ({
        productId: o.productId, moduleId,
        enabled: core.has(moduleId) || (nonCoreAllowed && Boolean(snap!.states.find((s) => s.moduleId === moduleId)?.enabled)),
      }));
      return { states, source, license: lic, productStatus: snap?.productStatus ?? null };
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
