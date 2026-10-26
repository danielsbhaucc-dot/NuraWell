// Glue only: the store page lives in @platform/module-library-ui.
import { notFound } from 'next/navigation';
import { ModuleStorePage } from '@platform/module-library-ui';
import { REGISTRY, toProductRows } from '@platform/module-library-ui/server';
import '@platform/module-library-ui/src/finder.css';
import { PRODUCTS } from '@/lib/platform/catalog';
import { decide } from '@platform/iam';
import { ensureOpsAdminServer, getOpsSessionContext } from '@/lib/auth/ensure-ops-admin-server';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadActor, productsFor } from '@/lib/platform/authorize';
import { CATALOG } from '@/lib/platform/catalog';

export const dynamic = 'force-dynamic';

export default async function OpsModulePage({ params }: { params: Promise<{ id: string }> }) {
  await ensureOpsAdminServer();
  // Server-side gate: module store requires founder or modules.manage on some product.
  const { user } = await getOpsSessionContext();
  const actor = await loadActor(createAdminClient(), user!.id);
  const canManage = productsFor(actor).founder || PRODUCTS.some((p) => decide(CATALOG, actor, p.id, 'modules.manage').allow);
  if (!canManage) notFound();
  const { id } = await params;
  const m = REGISTRY.find((x) => x.id === id);
  if (!m) notFound();
  return <ModuleStorePage m={m} products={toProductRows(PRODUCTS)} backHref="/ops/modules" />;
}
