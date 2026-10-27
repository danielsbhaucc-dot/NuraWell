import type { Permission, ProductId } from './types';

/** A self-contained capability. Products enable it with one toggle; core modules are always on. */
export type ModuleManifest = {
  id: string;
  name: string;
  /** Security-by-default: on for every registered product, can never be disabled. */
  core: boolean;
  dependsOn: readonly string[];
  permissions: readonly Permission[];
  /** Admin route prefixes owned by the module (disabled module → 404 on the server). */
  routes: readonly string[];
  migrations: readonly string[];
  settings?: Record<string, unknown>;
  /** Essential for end users: the toggle never blocks user surfaces (api/pages/crons/webhooks); admin areas still follow it. */
  essential?: boolean;
  /** User-facing API prefixes (gated for users when the module is explicitly off). */
  api?: readonly string[];
  /** Scheduled job paths (a disabled module's job is skipped with 200, so schedulers don't retry). */
  crons?: readonly string[];
  /** Inbound webhook / workflow prefixes. */
  webhooks?: readonly string[];
  /** Page path prefixes (disabled module → the app's normal 404). */
  pages?: readonly string[];
};

export type Surface = 'admin' | 'api' | 'cron' | 'webhook' | 'page';

export type ModuleState = { productId: ProductId; moduleId: string; enabled: boolean };

/** Core modules are on for any product even with zero rows: a new product inherits them with no extra code. */
export function isModuleEnabled(registry: readonly ModuleManifest[], states: readonly ModuleState[], product: ProductId, moduleId: string): boolean {
  const m = registry.find((x) => x.id === moduleId);
  if (!m) return false;
  if (m.core) return true;
  const on = states.some((s) => s.productId === product && s.moduleId === moduleId && s.enabled);
  return on && m.dependsOn.every((d) => isModuleEnabled(registry, states, product, d));
}

/** Which module owns a path (longest prefix). */
export function moduleForPath(registry: readonly ModuleManifest[], path: string): ModuleManifest | undefined {
  let best: ModuleManifest | undefined; let len = -1;
  for (const m of registry) for (const r of m.routes) if ((path === r || path.startsWith(r + '/')) && r.length > len) { best = m; len = r.length; }
  return best;
}

export function validateRegistry(registry: readonly ModuleManifest[]): string[] {
  const errs: string[] = []; const ids = new Set(registry.map((m) => m.id));
  for (const m of registry) {
    for (const d of m.dependsOn) if (!ids.has(d)) errs.push(`${m.id}: missing dependency ${d}`);
    if (m.core) for (const d of m.dependsOn) if (!registry.find((x) => x.id === d)?.core) errs.push(`${m.id}: core module depends on non-core ${d}`);
  }
  return errs;
}

function longest(registry: readonly ModuleManifest[], path: string, pick: (m: ModuleManifest) => readonly { p: string; s: Surface }[]) {
  let best: { module: ModuleManifest; surface: Surface } | undefined; let len = -1;
  for (const m of registry) for (const { p, s } of pick(m)) {
    const hit = p === '/' ? path === '/' : (path === p || path.startsWith(p + '/'));
    if (hit && p.length > len) { best = { module: m, surface: s }; len = p.length; }
  }
  return best;
}

/** Which module owns a server path (admin route, user API, cron or webhook), longest prefix wins. */
export function ownerOfPath(registry: readonly ModuleManifest[], path: string) {
  return longest(registry, path, (m) => [
    ...m.routes.map((p) => ({ p, s: 'admin' as const })), ...(m.api ?? []).map((p) => ({ p, s: 'api' as const })),
    ...(m.crons ?? []).map((p) => ({ p, s: 'cron' as const })), ...(m.webhooks ?? []).map((p) => ({ p, s: 'webhook' as const })),
  ]);
}

/** Which module owns a page path. */
export function ownerOfPage(registry: readonly ModuleManifest[], path: string) {
  return longest(registry, path, (m) => (m.pages ?? []).map((p) => ({ p, s: 'page' as const })));
}

/** Modules that list `moduleId` as a dependency. */
export function dependentsOf(registry: readonly ModuleManifest[], moduleId: string): ModuleManifest[] {
  return registry.filter((m) => m.dependsOn.includes(moduleId));
}

export type ToggleCheck = { ok: true } | { ok: false; reason: 'unknown_module' | 'core_module' | 'missing_dependency' | 'has_dependents'; modules: string[] };

/** WordPress-style toggle rules: core stays on; can't enable with a dependency off; can't disable while an enabled module needs it. */
export function checkToggle(registry: readonly ModuleManifest[], states: readonly ModuleState[], product: ProductId, moduleId: string, enable: boolean): ToggleCheck {
  const m = registry.find((x) => x.id === moduleId);
  if (!m) return { ok: false, reason: 'unknown_module', modules: [moduleId] };
  if (enable) {
    const missing = m.dependsOn.filter((d) => !isModuleEnabled(registry, states, product, d));
    return missing.length ? { ok: false, reason: 'missing_dependency', modules: missing } : { ok: true };
  }
  if (m.core) return { ok: false, reason: 'core_module', modules: [moduleId] };
  const needed = dependentsOf(registry, moduleId).filter((d) => isModuleEnabled(registry, states, product, d.id)).map((d) => d.id);
  return needed.length ? { ok: false, reason: 'has_dependents', modules: needed } : { ok: true };
}
