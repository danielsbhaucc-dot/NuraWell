import 'server-only';
import { cookies } from 'next/headers';
import { MODULES, DEFAULT_PRODUCT, PRODUCT_COOKIE } from './catalog';
import { centralModuleSource, loadModuleStates } from './authorize';
import { createAdminClient } from '@/lib/supabase/admin';
import type { ModuleState } from '@platform/iam';

export type OpsNavState = { hiddenPaths: string[]; licenseAlert: boolean };

/**
 * Pages of non-core modules that are OFF for this product. Pure; unknown/empty state hides nothing
 * (menus fail open — the server-side gate still 404s an absent module's pages and APIs).
 */
export function hiddenPathsFor(states: ModuleState[]): string[] {
  if (!states.length) return [];
  const on = new Set(states.filter((s) => s.enabled).map((s) => s.moduleId));
  return MODULES.filter((m) => !m.core && !on.has(m.id)).flatMap((m) => m.pages ?? []);
}

/** Menu state for the Ops shell. Never throws: any failure => show everything, no notice. */
export async function opsNavState(): Promise<OpsNavState> {
  try {
    const raw = (await cookies()).get(PRODUCT_COOKIE)?.value ?? DEFAULT_PRODUCT;
    const product = /^[a-z][a-z0-9-]{1,30}$/.test(raw) ? raw : DEFAULT_PRODUCT;
    const states = await loadModuleStates(createAdminClient(), product);
    let licenseAlert = false;
    try { licenseAlert = Boolean((await centralModuleSource(product)?.get())?.licenseAlert); } catch { /* no notice */ }
    return { hiddenPaths: hiddenPathsFor(states), licenseAlert };
  } catch {
    return { hiddenPaths: [], licenseAlert: false };
  }
}
