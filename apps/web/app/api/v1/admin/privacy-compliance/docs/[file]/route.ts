import { NextResponse } from 'next/server';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { createAdminClient } from '@/lib/supabase/admin';
import { isKnownDocFile } from '@/lib/privacy/compliance-checklist';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const notFound = () => new NextResponse('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });

/** Admin-only download of an internal compliance document. Bytes live in a service-role-only table. */
export async function GET(request: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  if (!isKnownDocFile(file)) return notFound();
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return notFound();
  const db = createAdminClient();
  const { data } = await db.from('owner_compliance_docs').select('content, mime').eq('slug', file).maybeSingle();
  const row = data as { content: string; mime: string } | null;
  if (!row) return notFound();
  const hex = String(row.content).replace(/^\\x/, '');
  const bytes = Buffer.from(hex, 'hex');
  await db.from('admin_audit_log').insert({ actor_id: auth.user.id, method: 'COMPLIANCE', path: `privacy_doc_download:${file}` });
  const pdf = file.endsWith('.pdf');
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      'Content-Type': row.mime,
      'Content-Disposition': `${pdf ? 'inline' : 'attachment'}; filename="${file}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex',
    },
  });
}
