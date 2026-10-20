import { NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/api/route-guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadAsset, loadMediaEvidence } from '@/lib/legal/media/provenance';
import { toListItem } from '@/lib/legal/media/ingest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireApiAdmin(request);
  if (!auth.ok) return auth.response;
  const key = new URL(request.url).searchParams.get('key') ?? '';
  const admin = createAdminClient();
  const a = await loadAsset(admin, key);
  if (!a) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const { records, attestations } = await loadMediaEvidence(admin, key);
  return NextResponse.json({
    item: toListItem(a),
    records: records.map((r) => {
      const d = (JSON.parse(r.payload_json) as { data: Record<string, unknown> }).data;
      return { id: r.id, event: r.event, created_at: r.created_at, record_hash: r.record_hash,
        tsa: attestations.some((x) => x.record_id === r.id && x.kind === 'tsa' && x.payload.token_b64), ots: attestations.some((x) => x.record_id === r.id && x.kind === 'ots'),
        summary: r.event === 'license_snapshot' ? { url: d.url, ok: !!d.blob_sha, wayback: (d.wayback as { url?: string } | null)?.url ?? null } : r.event === 'attachment' ? { name: d.name, label: d.label } : r.event === 'scan' ? { change: d.change, sha256: d.sha256 } : {} };
    }),
  }, { headers: { 'Cache-Control': 'no-store' } });
}
