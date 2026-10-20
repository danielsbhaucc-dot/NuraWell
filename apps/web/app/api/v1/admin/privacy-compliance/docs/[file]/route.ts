import { NextResponse } from 'next/server';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { createAdminClient } from '@/lib/supabase/admin';
import { isKnownDocFile } from '@/lib/privacy/compliance-checklist';
import { loadLegalObject } from '@/lib/legal/evidence-storage';
import { sha256Hex } from '@/lib/legal/evidence-crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const notFound = () => new NextResponse('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });

/** Admin-only download of an internal compliance document. Bytes live in the private EU legal bucket (storage_key) or, for legacy rows, in a service-role-only table. The stored sha256 must match. */
export async function GET(request: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  if (!isKnownDocFile(file)) return notFound();
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return notFound();
  const db = createAdminClient();
  const { data } = await db.from('owner_compliance_docs').select('content, mime, sha256, storage_key').eq('slug', file).maybeSingle();
  const row = data as { content: string | null; mime: string; sha256: string; storage_key: string | null } | null;
  if (!row) return notFound();
  let bytes: Buffer | null = null;
  if (row.content) bytes = Buffer.from(String(row.content).replace(/^\\x/, ''), 'hex');
  else if (row.storage_key) {
    try { bytes = await loadLegalObject(row.storage_key); } catch { bytes = null; }
  }
  if (!bytes || sha256Hex(bytes) !== row.sha256) return new NextResponse('Unavailable', { status: 503, headers: { 'Cache-Control': 'no-store' } });
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
