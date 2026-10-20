import { NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/api/route-guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { auditLegalAccess } from '@/lib/legal/evidence-verify';
import { loadAsset, verifyMediaAsset } from '@/lib/legal/media/provenance';
import { loadMediaBlob } from '@/lib/legal/media/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request) {
  const auth = await requireApiAdmin(request);
  if (!auth.ok) return auth.response;
  const key = new URL(request.url).searchParams.get('key') ?? '';
  const admin = createAdminClient();
  const a = await loadAsset(admin, key);
  if (!a) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  await auditLegalAccess(admin, auth.user.id, 'legal_media_verify', { asset_key: key });
  const file = a.file_blob_sha ? await loadMediaBlob(admin, a.file_blob_sha).catch(() => null) : null;
  const v = await verifyMediaAsset(admin, key, file?.bytes ?? null);
  return NextResponse.json({ ok: v.ok, chain_ok: v.chain_ok, file_ok: v.file_ok, checks: v.checks, checked_at: new Date().toISOString() });
}
