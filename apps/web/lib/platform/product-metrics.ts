import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Aggregates only (counts / sums). No user-level rows, so no PII justification is needed to view them. */
export type ProductMetrics = {
  productId: string;
  name: string;
  status: string;
  description: string | null;
  keyPurpose: string | null;
  users: number;
  aiCost30dUsd: number;
  aiCalls30d: number;
  errors7d: number;
};

type Row = {
  product_id: string; name: string; status: string; description: string | null; key_purpose: string | null;
  users: number | string; ai_cost_30d: number | string; ai_calls_30d: number | string; errors_7d: number | string;
};

export function mapMetricsRows(rows: Row[]): ProductMetrics[] {
  return rows.map((r) => ({
    productId: r.product_id,
    name: r.name,
    status: r.status,
    description: r.description,
    keyPurpose: r.key_purpose,
    users: Number(r.users) || 0,
    aiCost30dUsd: Number(r.ai_cost_30d) || 0,
    aiCalls30d: Number(r.ai_calls_30d) || 0,
    errors7d: Number(r.errors_7d) || 0,
  }));
}

/** Service-role only RPC (migration 000207). Fails closed to an empty list. */
export async function loadProductMetrics(admin: SupabaseClient): Promise<{ rows: ProductMetrics[]; error: string | null }> {
  const { data, error } = await admin.rpc('platform_product_metrics');
  if (error) return { rows: [], error: 'metrics_unavailable' };
  return { rows: mapMetricsRows((data ?? []) as Row[]), error: null };
}
