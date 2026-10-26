import type { ProductRow, ProductSummary, RegistryModule } from '../types';
import type { Deployment } from '../HubViews';
import registryJson from '../registry.generated.json';

export const REGISTRY = (registryJson as unknown as { modules: RegistryModule[] }).modules;
const COLORS: Record<string, string> = { nurawell: '#2f9e6b', fitflow: '#2a74c9', mindspace: '#7a52c7', sample: '#c2496f' };
const PANELS: Record<string, string> = { nurawell: '/ops' };

type Db = { from(t: string): any }; // eslint-disable-line @typescript-eslint/no-explicit-any
type Metrics = { productId: string; users: number; aiCost30dUsd: number; errors7d: number };

/** Builds hub props from aggregates only. Missing sources stay null; nothing is estimated. */
export async function loadHubData(db: Db, products: { id: string; name: string }[], metrics: { rows: Metrics[]; error: string | null }, visible: (productId: string) => boolean) {
  const shown = products.filter((p) => visible(p.id));
  const { data: states, error: stErr } = await db.from('iam_product_modules').select('product_id, module_id, enabled');
  const rows: ProductRow[] = shown.map((p) => ({
    id: p.id, name: p.name, color: COLORS[p.id] ?? '#5b6b7a', panelHref: PANELS[p.id] ?? null,
    enabled: stErr ? [] : ((states ?? []) as { product_id: string; module_id: string; enabled: boolean }[]).filter((s) => s.product_id === p.id && s.enabled).map((s) => s.module_id),
  }));
  const summaries: ProductSummary[] = metrics.rows.filter((r) => visible(r.productId)).map((r) => ({ productId: r.productId, users: r.users, aiCost30dUsd: r.aiCost30dUsd, errors7d: r.errors7d, securityOpen: null, tasksOpen: null }));
  const count = async (t: string, col: string, vals: string[]) => {
    const { count: n, error } = await db.from(t).select('id', { count: 'exact', head: true }).in(col, vals);
    return error ? null : (n ?? 0);
  };
  const deployment: Deployment = { securityOpen: await count('security_incidents', 'status', ['open']), tasksOpen: await count('compliance_tasks', 'status', ['open', 'in_progress']) };
  return { products: rows, summaries, deployment, metricsError: metrics.error, statesError: stErr ? 'module_states_unavailable' : null };
}
/** For the client hub: drop long docs (the store page loads the full entry server-side). */
export const REGISTRY_LITE: RegistryModule[] = REGISTRY.map((m) => ({ ...m, readme: '', changelog: '' }));
export const toProductRows = (ps: { id: string; name: string }[]): ProductRow[] => ps.map((p) => ({ id: p.id, name: p.name, color: COLORS[p.id] ?? '#5b6b7a', panelHref: PANELS[p.id] ?? null, enabled: [] }));
