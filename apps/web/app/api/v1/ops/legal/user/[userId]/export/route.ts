import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiAdmin } from '@/lib/api/route-guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { auditLegalAccess } from '@/lib/legal/evidence-verify';
import { buildEvidencePackage } from '@/lib/legal/evidence-export';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** "אני צריך ראיה": ZIP with the designed PDF report + originals + JSON + proofs. */
export async function GET(request: Request, ctx: { params: Promise<{ userId: string }> }) {
  const auth = await requireApiAdmin(request);
  if (!auth.ok) return auth.response;
  const { userId } = await ctx.params;
  if (!z.string().uuid().safeParse(userId).success) return NextResponse.json({ error: 'bad_id' }, { status: 400 });
  const admin = createAdminClient();
  await auditLegalAccess(admin, auth.user.id, 'legal_export_package', { user_id: userId });
  const pkg = await buildEvidencePackage(admin, userId, { id: auth.user.id, label: 'דניאל רחמן (מנהל המערכת)' });
  const pdfOnly = new URL(request.url).searchParams.get('format') === 'pdf';
  const body = new Uint8Array(pdfOnly ? pkg.pdf : pkg.zip);
  return new NextResponse(body, {
    headers: {
      'Content-Type': pdfOnly ? 'application/pdf' : 'application/zip',
      'Content-Disposition': `attachment; filename="${pkg.caseRef}.${pdfOnly ? 'pdf' : 'zip'}"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
