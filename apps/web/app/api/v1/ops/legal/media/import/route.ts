import { NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/api/route-guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { auditLegalAccess } from '@/lib/legal/evidence-verify';
import { importEvidenceBundle } from '@/lib/legal/media/import';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(request: Request) {
  const auth = await requireApiAdmin(request);
  if (!auth.ok) return auth.response;
  const raw = Buffer.from(await request.arrayBuffer());
  if (raw.length < 22 || raw.length > 4_400_000) return NextResponse.json({ error: 'bad_size' }, { status: 413 });
  const admin = createAdminClient();
  try {
    const r = await importEvidenceBundle(admin, raw, auth.user.id);
    await auditLegalAccess(admin, auth.user.id, 'legal_media_import', { receipts: r.receipts_new, attachments: r.attachments, provenance: r.provenance, files: r.files.length });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message.slice(0, 200) : 'import_failed' }, { status: 400 });
  }
}
