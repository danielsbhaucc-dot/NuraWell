// One server-side gate for every user surface (API, cron, webhook/workflow, page), WordPress-plugin style.
// Rules (security + "users never locked out"):
//  * Core and essential modules are never blocked for users, whatever central says.
//  * A module is blocked only when a VERIFIED central snapshot (live or ≤6h cache) says it — or a module it depends on — is off.
//    Central down with no verified snapshot ("failsafe") → nothing is blocked here (admin areas keep failing closed in authorize()).
//  * Unknown modules / no row → not blocked (a newly registered module behaves exactly as before until someone turns it off).
// Admin/ops APIs keep their existing (stricter) gate in requireApiAdmin → authorize().
import { ownerOfPage, ownerOfPath, type ModuleManifest, type Surface } from '@platform/iam';
import { DEFAULT_PRODUCT, MODULES } from './catalog';

export type GateStates = { source: 'central' | 'cache' | 'failsafe'; states: readonly { moduleId: string; enabled: boolean }[] };
export type GateDecision = { blocked: false; moduleId: string | null; surface: Surface | null } | { blocked: true; moduleId: string; surface: Surface; offModule: string };

export function ownerFor(path: string, kind: 'server' | 'page', registry: readonly ModuleManifest[] = MODULES) {
  return kind === 'page' ? ownerOfPage(registry, path) : ownerOfPath(registry, path);
}

/** Does this module need a central lookup at all? (Core/essential never do: zero cost on those paths.) */
export function isGateable(m: ModuleManifest | undefined): m is ModuleManifest {
  return Boolean(m && !m.core && !m.essential);
}

/** Pure decision (unit-tested). */
export function decideGate(registry: readonly ModuleManifest[], owner: { module: ModuleManifest; surface: Surface } | undefined, st: GateStates | null): GateDecision {
  if (!owner) return { blocked: false, moduleId: null, surface: null };
  const { module: m, surface } = owner;
  if (surface === 'admin' || !isGateable(m) || !st || st.source === 'failsafe') return { blocked: false, moduleId: m.id, surface };
  const seen = new Set<string>();
  const off = (id: string): string | null => {
    if (seen.has(id)) return null; seen.add(id);
    const mm = registry.find((x) => x.id === id);
    if (!mm || mm.core) return null;
    if (st.states.some((s) => s.moduleId === id && s.enabled === false)) return id;
    for (const d of mm.dependsOn) { const r = off(d); if (r) return r; }
    return null;
  };
  const offModule = off(m.id);
  return offModule ? { blocked: true, moduleId: m.id, surface, offModule } : { blocked: false, moduleId: m.id, surface };
}

/** Runtime gate. Never throws; any error → not blocked (users are never locked out by an outage). */
export async function gateRequest(path: string, kind: 'server' | 'page'): Promise<GateDecision> {
  const owner = ownerFor(path, kind);
  if (!owner || owner.surface === 'admin' || !isGateable(owner.module)) return { blocked: false, moduleId: owner?.module.id ?? null, surface: owner?.surface ?? null };
  try {
    const { centralModuleSource } = await import('./authorize');
    const src = centralModuleSource(DEFAULT_PRODUCT);
    if (!src) return { blocked: false, moduleId: owner.module.id, surface: owner.surface };
    const r = await src.get();
    return decideGate(MODULES, owner, { source: r.source, states: r.states });
  } catch {
    return { blocked: false, moduleId: owner.module.id, surface: owner.surface };
  }
}

/** Response for a blocked server path: crons/webhooks get 200 "skipped" (no scheduler retries), APIs get 404. */
export function blockedResponse(d: Extract<GateDecision, { blocked: true }>): Response {
  const headers = { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-module-gate': d.moduleId };
  if (d.surface === 'cron' || d.surface === 'webhook') return new Response(JSON.stringify({ ok: true, skipped: true, reason: 'module_disabled', module: d.moduleId }), { status: 200, headers });
  return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers });
}

/** For code paths that run outside a request (scheduler fan-out, server actions): `if (!(await moduleOn('reminders'))) return;` */
export async function moduleOn(moduleId: string): Promise<boolean> {
  const m = MODULES.find((x) => x.id === moduleId);
  if (!m) return true;
  const fake = { module: m, surface: 'api' as const };
  if (!isGateable(m)) return true;
  try {
    const { centralModuleSource } = await import('./authorize');
    const src = centralModuleSource(DEFAULT_PRODUCT);
    if (!src) return true;
    const r = await src.get();
    return !decideGate(MODULES, fake, { source: r.source, states: r.states }).blocked;
  } catch { return true; }
}
