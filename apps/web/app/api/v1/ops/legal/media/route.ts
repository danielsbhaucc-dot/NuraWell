import { NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/api/route-guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { toListItem, type IndexRow } from '@/lib/legal/media/ingest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Whole register (small: hundreds of rows) — the client filters/searches instantly. */
export async function GET(request: Request) {
  const auth = await requireApiAdmin(request);
  if (!auth.ok) return auth.response;
  const admin = createAdminClient();
  const { data, error } = await admin.from('media_provenance_assets').select('*').order('status').order('updated_at', { ascending: false }).limit(3000);
  if (error) return NextResponse.json({ error: 'load_failed' }, { status: 500 });
  const items = ((data ?? []) as IndexRow[]).map(toListItem);
  const { data: cost } = await admin.from('ai_usage_events').select('cost_usd').eq('feature', 'media_provenance_ai').limit(20000);
  const costs = (cost ?? []).map((r) => Number((r as { cost_usd?: number }).cost_usd ?? 0));
  return NextResponse.json({ items, ai: { calls: costs.length, total_usd: costs.reduce((a, b) => a + b, 0) } }, { headers: { 'Cache-Control': 'no-store' } });
}
