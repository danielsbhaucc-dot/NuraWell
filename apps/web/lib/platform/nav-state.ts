import 'server-only';
import { cookies } from 'next/headers';
import { CATALOG, DEFAULT_PRODUCT, MODULES, PRODUCT_COOKIE, PRODUCTS } from './catalog';
import { centralModuleSource, loadActor, loadModuleStates } from './authorize';
import { decide, isFounder, type Actor } from '@platform/iam';
import { createAdminClient } from '@/lib/supabase/admin';
import type { ModuleState } from '@platform/iam';

export type LicenseNotice = { productId: string; name: string };
export type OpsNavState = { hiddenPaths: string[]; licenseNotices: LicenseNotice[] };

/**
 * Which products' license/billing notices this actor may see. Pure.
 * platform.founder: every product with an alert. A product admin (owner/admin or any role with billing.read):
 * only that product. Anyone else (editors, support, regular users, no grant): nothing.
 */
export function noticeProductsFor(actor: Actor, alerting: ReadonlySet<string>): LicenseNotice[] {
  const ids = isFounder(CATALOG, actor) ? PRODUCTS.map((p) => p.id) : PRODUCTS.filter((p) => decide(CATALOG, actor, p.id, 'billing.read', { steppedUp: true }).allow).map((p) => p.id);
  return PRODUCTS.filter((p) => ids.includes(p.id) && alerting.has(p.id)).map((p) => ({ productId: p.id, name: p.name }));
}

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
export async function opsNavState(userId: string | null | undefined): Promise<OpsNavState> {
  try {
    const raw = (await cookies()).get(PRODUCT_COOKIE)?.value ?? DEFAULT_PRODUCT;
    const product = /^[a-z][a-z0-9-]{1,30}$/.test(raw) ? raw : DEFAULT_PRODUCT;
    const db = createAdminClient();
    const states = await loadModuleStates(db, product);
    let licenseNotices: LicenseNotice[] = [];
    if (userId) {
      try {
        const actor = await loadActor(db, userId);
        const visible = noticeProductsFor(actor, new Set(PRODUCTS.map((p) => p.id)));
        const alerting = new Set<string>();
        await Promise.all(visible.map(async (p) => {
          try { if ((await centralModuleSource(p.productId)?.get())?.licenseAlert) alerting.add(p.productId); } catch { /* no notice */ }
        }));
        licenseNotices = noticeProductsFor(actor, alerting);
      } catch { /* no notice */ }
    }
    return { hiddenPaths: hiddenPathsFor(states), licenseNotices };
  } catch {
    return { hiddenPaths: [], licenseNotices: [] };
  }
}
