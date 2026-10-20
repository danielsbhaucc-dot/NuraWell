import { NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/api/route-guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { scanStorage } from '@/lib/legal/media/ingest';
import { syncRepoManifest } from '@/lib/legal/media/repo-sync';
import { auditLegalAccess } from '@/lib/legal/evidence-verify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Manual "סריקה עכשיו": repo manifest + storage library. Only new/changed files cost anything. */
export async function POST(request: Request) {
  const auth = await requireApiAdmin(request);
  if (!auth.ok) return auth.response;
  const admin = createAdminClient();
  await auditLegalAccess(admin, auth.user.id, 'legal_media_scan', {});
  const repo = await syncRepoManifest(admin, new URL(request.url).origin);
  const st = await scanStorage(admin);
  return NextResponse.json({ total: st.total + repo.new + repo.changed + repo.unchanged, new: st.new + repo.new, changed: st.changed + repo.changed, errors: st.error + repo.error, cost: st.cost + repo.cost });
}
