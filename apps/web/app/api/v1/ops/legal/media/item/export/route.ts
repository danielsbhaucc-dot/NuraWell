import { NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/api/route-guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { auditLegalAccess } from '@/lib/legal/evidence-verify';
import { buildMediaEvidencePackage } from '@/lib/legal/media/export';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** "אני צריך ראיה" for one media asset. */
export async function GET(request: Request) {
  const auth = await requireApiAdmin(request);
  if (!auth.ok) return auth.response;
  const u = new URL(request.url);
  const key = u.searchParams.get('key') ?? '';
  const admin = createAdminClient();
  await auditLegalAccess(admin, auth.user.id, 'legal_media_export', { asset_key: key });
  const pkg = await buildMediaEvidencePackage(admin, key, { label: 'דניאל רחמן (מנהל המערכת)' });
  if (!pkg) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const pdfOnly = u.searchParams.get('format') === 'pdf';
  return new NextResponse(new Uint8Array(pdfOnly ? pkg.pdf : pkg.zip), {
    headers: { 'Content-Type': pdfOnly ? 'application/pdf' : 'application/zip', 'Content-Disposition': `attachment; filename="${pkg.caseRef}.${pdfOnly ? 'pdf' : 'zip'}"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}
