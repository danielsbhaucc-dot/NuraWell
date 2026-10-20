import { NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/api/route-guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { scanStorage } from '@/lib/legal/media/ingest';
import { auditLegalAccess } from '@/lib/legal/evidence-verify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(request: Request) {
  const auth = await requireApiAdmin(request);
  if (!auth.ok) return auth.response;
  const admin = createAdminClient();
  await auditLegalAccess(admin, auth.user.id, 'legal_media_scan', {});
  return NextResponse.json(await scanStorage(admin));
}
