// Glue only: the store page lives in @platform/module-library-ui.
import { notFound } from 'next/navigation';
import { ModuleStorePage } from '@platform/module-library-ui';
import { REGISTRY, toProductRows } from '@platform/module-library-ui/server';
import '@platform/module-library-ui/src/finder.css';
import { PRODUCTS } from '@/lib/platform/catalog';
import { ensureOpsAdminServer } from '@/lib/auth/ensure-ops-admin-server';

export const dynamic = 'force-dynamic';

export default async function OpsModulePage({ params }: { params: Promise<{ id: string }> }) {
  await ensureOpsAdminServer();
  const { id } = await params;
  const m = REGISTRY.find((x) => x.id === id);
  if (!m) notFound();
  return <ModuleStorePage m={m} products={toProductRows(PRODUCTS)} backHref="/ops/modules" />;
}
