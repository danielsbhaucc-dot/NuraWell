import type { SupabaseClient } from '@supabase/supabase-js';
import type { Provenance } from './labels';

export type PendingLicense = { key: string; title: string; action: string; kind?: 'license' | 'receipt' };

/** Media whose commercial license still waits for proof (explicit 'pending', or AI media without any receipt). */
export async function pendingLicenseItems(db: SupabaseClient): Promise<PendingLicense[]> {
  const { data } = await db.from('media_provenance_assets').select('asset_key, title, source_type, provenance, missing').eq('present', true).in('source_type', ['ai_music', 'ai_image', 'ai_voice']).limit(500);
  return ((data ?? []) as Array<{ asset_key: string; title: string | null; source_type: string; provenance: Provenance; missing: string[] }>)
    .filter((r) => r.provenance?.license_status === 'pending' || (r.missing ?? []).includes('attachments'))
    .map((r) => ({
      key: r.asset_key,
      title: r.title ?? r.asset_key,
      action: r.provenance?.generator === 'suno' ? 'לרכוש הורדה ב־Suno (בודדת או במנוי Pro) ולהעלות צילום של הקבלה' : 'להעלות קבלה או צילום שמוכיחים מנוי בתשלום בזמן היצירה',
      kind: 'license' as const,
    }));
}

/** Receipts the rules could not place (no vendor/period, or flagged for review): shown in the same card list. */
export async function unmatchedReceipts(db: SupabaseClient): Promise<PendingLicense[]> {
  const { data } = await db.from('media_receipts').select('id, vendor, subject, period_start, period_end, trust').or('trust.eq.review,period_start.is.null,period_end.is.null').neq('trust', 'rejected').neq('source', 'gmail_confirmation').limit(50);
  return ((data ?? []) as Array<{ id: string; vendor: string; subject: string | null; period_start: string | null }>).map((r) => ({
    key: `receipt:${r.id}`, kind: 'receipt' as const,
    title: r.subject?.slice(0, 80) || r.vendor,
    action: r.period_start ? 'הקבלה ממתינה לאישור שלך (ספק או מקור לא אומתו)' : 'לא זוהתה תקופת מנוי: להשלים ספק ותאריכים בקבלה',
  }));
}

/** One deterministic line for Gideon's daily digest (no model call). */
export async function pendingLicenseLine(db: SupabaseClient, link: string): Promise<string | null> {
  const items = await pendingLicenseItems(db);
  if (!items.length) return null;
  const first = items[0]!;
  const more = items.length > 1 ? ` ועוד ${items.length - 1}` : '';
  return `🎵 רישיון ממתין: "${first.title}"${more}. ${first.action}. 🔗 ${link}`;
}
