import { NextResponse } from 'next/server';
import { authorizeCronRequest } from '@/lib/api/authorize-cron';
import { createAdminClient } from '@/lib/supabase/admin';
import { maybeAnchorChainHead } from '@/lib/legal/record-evidence';
import { processImportQueue } from '@/lib/legal/media/import';
import { maybeAnchorMediaChainHead } from '@/lib/legal/media/record';
import { snapshotProviderTerms } from '@/lib/legal/media/terms';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Daily public anchoring of the consent + media evidence chain heads (QStash / CRON_SECRET). */
export async function POST(request: Request) {
  const denied = await authorizeCronRequest(request);
  if (denied) return denied;
  const admin = createAdminClient();
  const imported = await processImportQueue(admin).catch(() => []);
  const r = await maybeAnchorChainHead(admin);
  const media = await maybeAnchorMediaChainHead(admin).catch(() => ({ anchored: false }));
  // Daily: archive provider terms pages; a new signed version is stored only when a page changed.
  const terms = await snapshotProviderTerms(admin).catch(() => []);
  return NextResponse.json({ ...r, media, imported: imported.length, terms_changed: terms.filter((t) => t.changed).length });
}
export const GET = POST;
