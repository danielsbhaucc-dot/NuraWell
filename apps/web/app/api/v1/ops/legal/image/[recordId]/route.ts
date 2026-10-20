import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiAdmin } from '@/lib/api/route-guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { auditLegalAccess } from '@/lib/legal/evidence-verify';
import { loadEvidenceImage } from '@/lib/legal/evidence-storage';
import { sha256Hex } from '@/lib/legal/evidence-crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Admin-only proxy for evidence screenshots (never a public URL). Every view/download is audited. */
export async function GET(request: Request, ctx: { params: Promise<{ recordId: string }> }) {
  const auth = await requireApiAdmin(request);
  if (!auth.ok) return auth.response;
  const { recordId } = await ctx.params;
  if (!z.string().uuid().safeParse(recordId).success) return NextResponse.json({ error: 'bad_id' }, { status: 400 });
  const admin = createAdminClient();
  const { data } = await admin.from('consent_evidence').select('user_id, screenshot_storage, screenshot_key, screenshot_sha256').eq('id', recordId).maybeSingle();
  const r = data as { user_id: string; screenshot_storage: string | null; screenshot_key: string | null; screenshot_sha256: string | null } | null;
  if (!r?.screenshot_sha256) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const download = new URL(request.url).searchParams.get('download') === '1';
  await auditLegalAccess(admin, auth.user.id, download ? 'legal_download_image' : 'legal_view_image', { user_id: r.user_id, record_id: recordId });
  const img = await loadEvidenceImage(admin, r.user_id, r.screenshot_storage, r.screenshot_key).catch(() => null);
  if (!img) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return new NextResponse(new Uint8Array(img), {
    headers: {
      'Content-Type': 'image/webp',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Evidence-SHA256-Match': sha256Hex(img) === r.screenshot_sha256 ? '1' : '0',
      ...(download ? { 'Content-Disposition': `attachment; filename="consent-${recordId}.webp"` } : {}),
    },
  });
}
