import { VENDORS, type VendorId } from '@/lib/legal/media/receipts-core';

/**
 * Receipt ↔ asset auto-match with a confidence score and plain Hebrew reasons.
 * ≥ 90 and verified receipt → auto-resolved (shown as "שויך לבד"); 50–89 → Daniel confirms in the inbox.
 */
export type MatchReceipt = { id: string; vendor: VendorId; plan: string | null; amount: number | null; currency: string | null; receipt_date: string | null; period_start: string | null; period_end: string | null; trust: string; subject: string | null };
export type MatchAsset = { asset_key: string; source_type: string; provenance: { generator?: string | null; created_on?: string | null; plan?: string | null; account?: string | null } | null; first_seen_at?: string | null };
export type Match = { receipt: MatchReceipt; confidence: number; reasons: string[]; auto: boolean };

const dayDiff = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 864e5;

export function scoreMatch(a: MatchAsset, r: MatchReceipt): { confidence: number; reasons: string[] } {
  const reasons: string[] = []; let s = 0;
  const gen = a.provenance?.generator ?? null;
  const when = a.provenance?.created_on ?? a.first_seen_at?.slice(0, 10) ?? null;
  if (r.trust === 'rejected') return { confidence: 0, reasons: [] };
  const v = VENDORS[r.vendor] as { generators: readonly string[]; label?: string } | undefined;
  if (gen && v?.generators.includes(gen)) { s += 45; reasons.push('אותו ספק'); } else return { confidence: 0, reasons: [] };
  if (when && r.period_start && r.period_end && when >= r.period_start && when <= r.period_end) { s += 35; reasons.push('תאריך היצירה בתוך תקופת המנוי'); }
  else if (when && r.receipt_date && dayDiff(when, r.receipt_date) <= 3) { s += 25; reasons.push('נקנה סמוך ליום היצירה'); }
  else if (when && r.receipt_date && dayDiff(when, r.receipt_date) <= 31) { s += 10; reasons.push('קבלה מאותו חודש'); }
  else return { confidence: 0, reasons: [] };
  if (a.provenance?.plan && r.plan && r.plan.toLowerCase().includes(a.provenance.plan.toLowerCase())) { s += 8; reasons.push('אותה תוכנית'); }
  if (r.trust === 'verified') { s += 12; reasons.push('הקבלה מאומתת מול השולח'); }
  return { confidence: Math.min(100, s), reasons };
}

export function bestMatch(a: MatchAsset, receipts: MatchReceipt[], decided: Map<string, 'confirmed' | 'rejected'>): Match | null {
  let best: Match | null = null;
  for (const r of receipts) {
    if (decided.get(`${a.asset_key}|${r.id}`) === 'rejected') continue;
    const { confidence, reasons } = scoreMatch(a, r);
    if (confidence < 50) continue;
    if (!best || confidence > best.confidence) best = { receipt: r, confidence, reasons, auto: confidence >= 90 && r.trust === 'verified' };
  }
  return best;
}
