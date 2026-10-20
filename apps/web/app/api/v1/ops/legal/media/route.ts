import { NextResponse, after } from 'next/server';
import { requireApiAdmin } from '@/lib/api/route-guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { toListItem, type IndexRow } from '@/lib/legal/media/ingest';
import { repoSyncNeeded, syncRepoManifest } from '@/lib/legal/media/repo-sync';
import { pendingLicenseItems } from '@/lib/legal/media/pending';
import { coverageFor, type ReceiptPeriod } from '@/lib/legal/media/receipts-core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Whole register (hundreds of rows) — the client filters/searches instantly. First view after a deploy also ingests the repo manifest (in the background). */
export async function GET(request: Request) {
  const auth = await requireApiAdmin(request);
  if (!auth.ok) return auth.response;
  const admin = createAdminClient();
  const syncing = await repoSyncNeeded(admin).catch(() => false);
  if (syncing) { after(() => syncRepoManifest(admin).then(() => undefined, () => undefined)); }
  const [{ data, error }, { data: rc }, { data: cost }] = await Promise.all([
    admin.from('media_provenance_assets').select('*').order('status').order('updated_at', { ascending: false }).limit(3000),
    admin.from('media_receipts').select('id, vendor, plan, period_start, period_end, trust').limit(1000),
    admin.from('ai_usage_events').select('cost_usd').eq('feature', 'media_provenance_ai').limit(20000),
  ]);
  if (error) return NextResponse.json({ error: 'load_failed' }, { status: 500 });
  const receipts = (rc ?? []) as ReceiptPeriod[];
  const items = ((data ?? []) as IndexRow[]).map((r) => {
    const c = ['ai_image', 'ai_music', 'ai_voice'].includes(r.source_type) ? coverageFor(r.provenance?.generator, r.provenance?.created_on, receipts) : null;
    return { ...toListItem(r), coverage: c ? { vendor: c.vendor, plan: c.plan, period_start: c.period_start, period_end: c.period_end, trust: c.trust } : null };
  });
  const costs = (cost ?? []).map((r) => Number((r as { cost_usd?: number }).cost_usd ?? 0));
  const pending = await pendingLicenseItems(admin).catch(() => []);
  return NextResponse.json({ items, pending, syncing, ai: { calls: costs.length, total_usd: costs.reduce((a, b) => a + b, 0) } }, { headers: { 'Cache-Control': 'no-store' } });
}
