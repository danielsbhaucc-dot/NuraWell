// Glue only: the hub UI and data shaping live in @platform/module-library-ui (module-first).
import type { Metadata } from 'next';
import { decide } from '@platform/iam';
import { FinderDashboard } from '@platform/module-library-ui';
import { centralConfigured, loadCentralSnapshot, loadHubData, REGISTRY_LITE } from '@platform/module-library-ui/server';
import '@platform/module-library-ui/src/finder.css';
import { ensureOpsAdminServer, getOpsSessionContext } from '@/lib/auth/ensure-ops-admin-server';
import { createAdminClient, createCentralAdminClient } from '@/lib/supabase/admin';
import { loadActor, productsFor } from '@/lib/platform/authorize';
import { CATALOG, PRODUCTS } from '@/lib/platform/catalog';
import { loadProductMetrics } from '@/lib/platform/product-metrics';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'מרכז המוצרים והמודולים' };

export default async function OpsModulesPage() {
  await ensureOpsAdminServer();
  const { user } = await getOpsSessionContext();
  const admin = createAdminClient();
  const actor = await loadActor(admin, user!.id);
  const { founder } = productsFor(actor);
  const visible = (pid: string) => founder || decide(CATALOG, actor, pid, 'costs.read').allow;
  // Products + module states come from the central DB when it's configured; if it can't be reached, the product DB is used.
  const central = centralConfigured() ? await loadCentralSnapshot(createCentralAdminClient()).catch(() => null) : null;
  const { source: _source, ...hub } = await loadHubData(admin, PRODUCTS, await loadProductMetrics(admin), visible, central);
  return <FinderDashboard registry={REGISTRY_LITE} {...hub} signingReady={Boolean(process.env.LICENSE_SIGNING_KEY)} />;
}
