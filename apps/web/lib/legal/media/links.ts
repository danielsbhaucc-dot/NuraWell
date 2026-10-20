import 'server-only';
/** Receipt ⇄ media auto-linking (rule-based: vendor generators × coverage period × asset created_on). */
import type { SupabaseClient } from '@supabase/supabase-js';
import { coverageFor, type ReceiptPeriod } from './receipts-core';
import { appendMediaEvidence } from './record';
import type { Provenance } from './labels';

type AssetRow = { asset_key: string; provenance: Provenance | null };

/** Link one receipt to every AI asset it covers. Each new link = one signed record on the asset. Idempotent. */
export async function linkReceipt(admin: SupabaseClient, receiptId: string) {
  const { data: r } = await admin.from('media_receipts').select('id, vendor, plan, period_start, period_end, trust, record_hash').eq('id', receiptId).maybeSingle();
  if (!r) return { linked: 0, unmatched: true };
  const rp = r as ReceiptPeriod & { id: string; record_hash: string | null };
  if (!rp.period_start || !rp.period_end || rp.trust === 'rejected') return { linked: 0, unmatched: true };
  const { data } = await admin.from('media_provenance_assets').select('asset_key, provenance').in('source_type', ['ai_image', 'ai_music', 'ai_voice', 'ai_video']).eq('present', true).limit(3000);
  let linked = 0;
  for (const a of (data ?? []) as AssetRow[]) {
    const p = a.provenance ?? {};
    if (!coverageFor(p.generator as never, p.created_on as string | null, [rp])) continue;
    const ids = (p.receipt_ids as string[] | undefined) ?? [];
    if (ids.includes(rp.id)) continue;
    const rec = await appendMediaEvidence(admin, a.asset_key, 'receipt', { link: 'covered_by_receipt', receipt_id: rp.id, receipt_record_hash: rp.record_hash, vendor: rp.vendor, plan: rp.plan, period_start: rp.period_start, period_end: rp.period_end, method: 'auto_rule' });
    if (!rec.ok) continue;
    await admin.from('media_provenance_assets').update({ provenance: { ...p, receipt_ids: [...ids, rp.id] }, latest_record_hash: rec.recordHash, updated_at: new Date().toISOString() }).eq('asset_key', a.asset_key);
    linked++;
  }
  return { linked, unmatched: false };
}

/** Re-link after an asset's created_on/generator changes: try every receipt. */
export async function relinkAsset(admin: SupabaseClient) {
  const { data } = await admin.from('media_receipts').select('id').neq('trust', 'rejected').limit(500);
  let linked = 0;
  for (const r of (data ?? []) as Array<{ id: string }>) linked += (await linkReceipt(admin, r.id)).linked;
  return linked;
}
