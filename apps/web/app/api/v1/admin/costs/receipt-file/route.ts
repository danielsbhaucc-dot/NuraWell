import { NextResponse } from 'next/server';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadMediaBlob } from '@/lib/legal/media/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Admin-only download of a stored receipt file: `?id=<receipt>&i=-1` (original .eml) or attachment index. */
export async function GET(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;
  const url = new URL(request.url);
  const id = url.searchParams.get('id') ?? '';
  const i = Number.parseInt(url.searchParams.get('i') ?? '-1', 10);
  if (!/^[0-9a-f-]{36}$/i.test(id) || !Number.isInteger(i)) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const admin = createAdminClient();
  const { data } = await admin.from('media_receipts').select('eml_sha, attachments').eq('id', id).maybeSingle();
  const row = data as { eml_sha: string; attachments: Array<{ sha256: string; name: string; mime: string }> | null } | null;
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const att = i >= 0 ? row.attachments?.[i] : null;
  const sha = i < 0 ? row.eml_sha : att?.sha256;
  if (!sha) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const b = await loadMediaBlob(admin, sha);
  if (!b) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const name = (i < 0 ? `receipt-${id.slice(0, 8)}.eml` : att!.name).replace(/[^\w.\-]+/g, '_');
  const inline = b.mime === 'application/pdf' || b.mime.startsWith('image/');
  return new NextResponse(new Uint8Array(b.bytes), {
    headers: {
      'Content-Type': inline ? b.mime : 'application/octet-stream',
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${name}"`,
      'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
