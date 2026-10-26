import { ensureOpsAdminServer, getOpsSessionContext } from '@/lib/auth/ensure-ops-admin-server';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadActor, productsFor } from '@/lib/platform/authorize';
import { decide } from '@platform/iam';
import { CATALOG } from '@/lib/platform/catalog';
import { loadProductMetrics } from '@/lib/platform/product-metrics';
import { ProductsControlPlane } from '@/components/ops-products/ProductsControlPlane';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'כל המוצרים' };

/**
 * Central control plane: every registered product with aggregate numbers.
 * Same gate as the rest of Ops (stealth 404, trusted device), then per-product IAM: a product's row is shown
 * only to admins holding costs.read on it (the founder sees all). Aggregates only → no PII justification needed.
 */
export default async function OpsProductsPage() {
  await ensureOpsAdminServer();
  const { user } = await getOpsSessionContext();
  const admin = createAdminClient();
  const actor = await loadActor(admin, user!.id);
  const { founder } = productsFor(actor);
  const { rows, error } = await loadProductMetrics(admin);
  const visible = rows.filter((r) => founder || decide(CATALOG, actor, r.productId, 'costs.read').allow);
  return <ProductsControlPlane rows={visible} error={error} />;
}
