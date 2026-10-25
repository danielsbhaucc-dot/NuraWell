import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiAdmin } from '@/lib/api/route-guards';
import { exportStepUpRefusal } from '@/lib/ops/export-stepup';
import { createAdminClient } from '@/lib/supabase/admin';
import { auditLegalAccess } from '@/lib/legal/evidence-verify';
import { buildEvidencePackage } from '@/lib/legal/evidence-export';
import { runPreExportCheck } from '@/lib/legal/preexport-check';
import { contentDisposition, storeAndLogExport } from '@/lib/legal/export-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** "אני צריך ראיה": ZIP with the designed PDF report + originals + JSON + proofs. */
export async function GET(request: Request, ctx: { params: Promise<{ userId: string }> }) {
  const auth = await requireApiAdmin(request);
  if (!auth.ok) return auth.response;
  const stepUp = await exportStepUpRefusal(auth.supabase, auth.user.id, request);
  if (stepUp) return stepUp;
  const { userId } = await ctx.params;
  if (!z.string().uuid().safeParse(userId).success) return NextResponse.json({ error: 'bad_id' }, { status: 400 });
  const admin = createAdminClient();
  const url = new URL(request.url);
  // Export is blocked while critical pre-export items are open, unless an explicit, logged override is given.
  const pc = await runPreExportCheck(admin, userId);
  const reason = (url.searchParams.get('override_reason') ?? '').trim().slice(0, 500);
  const crit = pc.items.filter((i) => i.severity === 'critical');
  let override: { reason: string; by: string; at: string; items: string[] } | undefined;
  if (crit.length) {
    if (url.searchParams.get('override') !== '1' || reason.length < 10) {
      await auditLegalAccess(admin, auth.user.id, 'legal_export_blocked', { user_id: userId, critical: crit.map((i) => i.key) });
      return NextResponse.json({ error: 'precheck_blocked', critical: crit.map((i) => ({ key: i.key, title: i.title })) }, { status: 409, headers: { 'Cache-Control': 'no-store' } });
    }
    override = { reason, by: 'דניאל רחמן (מנהל המערכת)', at: new Date().toISOString(), items: crit.map((i) => i.title) };
    await auditLegalAccess(admin, auth.user.id, 'legal_export_override', { user_id: userId, critical: crit.map((i) => i.key), reason });
  }
  await auditLegalAccess(admin, auth.user.id, 'legal_export_package', { user_id: userId, override: !!override });
  const pkg = await buildEvidencePackage(admin, userId, { id: auth.user.id, label: 'דניאל רחמן (מנהל המערכת)' }, { override });
  const pdfOnly = url.searchParams.get('format') === 'pdf';
  const out = pdfOnly ? pkg.pdf : pkg.zip;
  const logged = await storeAndLogExport(admin, { actorId: auth.user.id, kind: 'consent', subject: userId, caseRef: pkg.caseRef, format: pdfOnly ? 'pdf' : 'zip', bytes: out, files: pdfOnly ? undefined : pkg.files, displayName: (pkg as { displayName?: string | null }).displayName ?? null, recordHashes: pkg.recordHashes, generatedAt: pkg.generatedAt });
  const body = new Uint8Array(logged.bytes);
  return new NextResponse(body, {
    headers: {
      'Content-Type': pdfOnly ? 'application/pdf' : 'application/zip',
      'Content-Disposition': contentDisposition(logged.fileName),
      'Cache-Control': 'no-store',
      'X-Export-SHA256': logged.sha, 'X-Export-Secret-Id': logged.secretId ?? '', 'X-Export-Code': logged.code, 'X-Export-File': encodeURIComponent(logged.fileName),
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
