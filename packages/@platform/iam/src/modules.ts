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
};

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
