import type { SupabaseClient } from '@supabase/supabase-js';
import type { Provenance } from './labels';

export type PendingLicense = { key: string; title: string; action: string };

/** Media whose commercial license still waits for proof (explicit 'pending', or AI media without any receipt). */
export async function pendingLicenseItems(db: SupabaseClient): Promise<PendingLicense[]> {
  const { data } = await db.from('media_provenance_assets').select('asset_key, title, source_type, provenance, missing').eq('present', true).in('source_type', ['ai_music', 'ai_image', 'ai_voice']).limit(500);
  return ((data ?? []) as Array<{ asset_key: string; title: string | null; source_type: string; provenance: Provenance; missing: string[] }>)
    .filter((r) => r.provenance?.license_status === 'pending' || (r.missing ?? []).includes('attachments'))
    .map((r) => ({
      key: r.asset_key,
      title: r.title ?? r.asset_key,
      action: r.provenance?.generator === 'suno' ? 'לרכוש הורדה ב־Suno (בודדת או במנוי Pro) ולהעלות צילום של הקבלה' : 'להעלות קבלה או צילום שמוכיחים מנוי בתשלום בזמן היצירה',
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
