import type { ProductRow, ProductSummary, RegistryModule } from '../types';
import type { Deployment } from '../HubViews';
import type { ActivityItem, CostTrend } from '../OverviewExtras';
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
  const ids = shown.map((p) => p.id);
  const { data: log, error: logErr } = await db.from('iam_audit_log').select('at, kind, product_id').order('seq', { ascending: false }).limit(40);
  // Only time, kind and product leave the server: no actor, target or detail (PII-free by construction).
  const activity: ActivityItem[] | null = logErr ? null : ((log ?? []) as { at: string; kind: string; product_id: string | null }[])
    .filter((r) => r.product_id === null || ids.includes(r.product_id)).slice(0, 10).map((r) => ({ at: r.at, kind: r.kind, productId: r.product_id }));
  return { products: rows, summaries, deployment, activity, costTrend: await loadCostTrend(db, ids), metricsError: metrics.error, statesError: stErr ? 'module_states_unavailable' : null };
}
const TREND_CAP = 20000;
/** Daily AI spend for the visible products, from ai_usage_events (the same table the cost screen reads). Null when unavailable. */
async function loadCostTrend(db: Db, ids: string[]): Promise<CostTrend> {
  if (!ids.length) return null;
  const since = new Date(Date.now() - 30 * 864e5);
  const { data, error } = await db.from('ai_usage_events').select('created_at, cost_usd').in('product_id', ids).gte('created_at', since.toISOString()).limit(TREND_CAP);
  if (error) return null;
  const byDay = new Map<string, number>();
  for (let i = 29; i >= 0; i--) byDay.set(new Date(Date.now() - i * 864e5).toISOString().slice(0, 10), 0);
  for (const r of (data ?? []) as { created_at: string; cost_usd: number | string | null }[]) { const d = r.created_at.slice(0, 10); if (byDay.has(d)) byDay.set(d, byDay.get(d)! + (Number(r.cost_usd) || 0)); }
  const days = [...byDay].map(([day, usd]) => ({ day, usd }));
  return days.some((d) => d.usd > 0) ? { days, partial: (data ?? []).length >= TREND_CAP } : { days: [], partial: false };
}
/** For the client hub: drop long docs (the store page loads the full entry server-side). */
export const REGISTRY_LITE: RegistryModule[] = REGISTRY.map((m) => ({ ...m, readme: '', changelog: '' }));
export const toProductRows = (ps: { id: string; name: string }[]): ProductRow[] => ps.map((p) => ({ id: p.id, name: p.name, color: COLORS[p.id] ?? '#5b6b7a', panelHref: PANELS[p.id] ?? null, enabled: [] }));
