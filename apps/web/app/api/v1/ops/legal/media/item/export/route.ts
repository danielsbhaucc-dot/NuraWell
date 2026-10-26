import { NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/api/route-guards';
import { exportStepUpRefusal } from '@/lib/ops/export-stepup';
import { createAdminClient } from '@/lib/supabase/admin';
import { auditLegalAccess } from '@/lib/legal/evidence-verify';
import { buildMediaEvidencePackage } from '@/lib/legal/media/export';
import { contentDisposition, storeAndLogExport } from '@/lib/legal/export-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** "אני צריך ראיה" for one media asset. */
export async function GET(request: Request) {
  const auth = await requireApiAdmin(request);
  if (!auth.ok) return auth.response;
  const stepUp = await exportStepUpRefusal(auth.supabase, auth.user.id, request);
  if (stepUp) return stepUp;
  const u = new URL(request.url);
  const key = u.searchParams.get('key') ?? '';
  const admin = createAdminClient();
  await auditLegalAccess(admin, auth.user.id, 'legal_media_export', { asset_key: key });
  const pkg = await buildMediaEvidencePackage(admin, key, { label: 'דניאל רחמן (מנהל המערכת)' });
  if (!pkg) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const pdfOnly = u.searchParams.get('format') === 'pdf';
  const out = pdfOnly ? pkg.pdf : pkg.zip;
  const logged = await storeAndLogExport(admin, { actorId: auth.user.id, kind: 'media', subject: key, caseRef: pkg.caseRef, format: pdfOnly ? 'pdf' : 'zip', bytes: out, files: pdfOnly ? undefined : pkg.files, displayName: (pkg as { displayName?: string | null }).displayName ?? null, recordHashes: pkg.recordHashes, generatedAt: pkg.generatedAt });
  return new NextResponse(new Uint8Array(logged.bytes), {
    headers: { 'Content-Type': pdfOnly ? 'application/pdf' : 'application/zip', 'Content-Disposition': contentDisposition(logged.fileName), 'Cache-Control': 'no-store', 'X-Export-SHA256': logged.sha, 'X-Export-Secret-Id': logged.secretId ?? '', 'X-Export-Code': logged.code, 'X-Export-File': encodeURIComponent(logged.fileName), 'X-Content-Type-Options': 'nosniff' },
  });
}
