import { NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/api/route-guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadAsset } from '@/lib/legal/media/provenance';
import { loadMediaBlob } from '@/lib/legal/media/store';
import { id3Cover } from '@/lib/legal/hub/cover';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Owner-only preview of the archived original (rendered via <img>/<audio>, sandboxed). */
export async function GET(request: Request) {
  const auth = await requireApiAdmin(request);
  if (!auth.ok) return auth.response;
  const key = new URL(request.url).searchParams.get('key') ?? '';
  const admin = createAdminClient();
  const a = await loadAsset(admin, key);
  if (!a?.file_blob_sha) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const b = await loadMediaBlob(admin, a.file_blob_sha);
  if (!b) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  // ?cover=1 → embedded cover art of a song (for the hub's asset tiles); 404 when none.
  if (new URL(request.url).searchParams.get('cover') === '1') {
    const c = b.mime.startsWith('audio/') ? id3Cover(new Uint8Array(b.bytes)) : null;
    if (!c) return NextResponse.json({ error: 'no_cover' }, { status: 404, headers: { 'Cache-Control': 'private, max-age=600' } });
    return new NextResponse(new Uint8Array(c.bytes), { headers: { 'Content-Type': c.mime, 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' } });
  }
  return new NextResponse(new Uint8Array(b.bytes), { headers: { 'Content-Type': b.mime, 'Cache-Control': 'private, max-age=600', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox" } });
}
