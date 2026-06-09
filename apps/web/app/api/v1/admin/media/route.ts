import { NextResponse } from 'next/server';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolvePublicUrlForAsset } from '@/lib/cdn/public-media';
import { mediaAssetListQuerySchema } from '@/lib/validation/media-asset';

export const runtime = 'nodejs';

function enrichRow(row: Record<string, unknown>) {
  const url = resolvePublicUrlForAsset({
    kind: row.kind as 'image' | 'audio' | 'file' | 'video',
    object_key: (row.object_key as string) ?? null,
    public_url: (row.public_url as string) ?? null,
    external_url: (row.external_url as string) ?? null,
  });
  return { ...row, url };
}

export async function GET(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const parsed = mediaAssetListQuerySchema.safeParse({
    kind: url.searchParams.get('kind') ?? undefined,
    file_subtype: url.searchParams.get('file_subtype') ?? undefined,
    folder: url.searchParams.get('folder') ?? undefined,
    folder_prefix: url.searchParams.get('folder_prefix') ?? undefined,
    q: url.searchParams.get('q') ?? undefined,
    page: url.searchParams.get('page') ?? undefined,
    per_page: url.searchParams.get('per_page') ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: 'פרמטרים לא תקינים' }, { status: 400 });
  }

  const { kind, file_subtype, folder, folder_prefix, q, page, per_page } = parsed.data;
  const from = (page - 1) * per_page;
  const to = from + per_page - 1;

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (admin as any)
    .from('media_assets')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (kind) query = query.eq('kind', kind);
  if (file_subtype) query = query.eq('file_subtype', file_subtype);
  if (folder) query = query.eq('folder', folder);
  if (folder_prefix) query = query.ilike('folder', `${folder_prefix}%`);
  if (q) {
    query = query.or(
      `title.ilike.%${q}%,original_filename.ilike.%${q}%,alt_text.ilike.%${q}%,folder.ilike.%${q}%`
    );
  }

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const items = (data ?? []).map((row: Record<string, unknown>) => enrichRow(row));

  return NextResponse.json({
    items,
    total: count ?? items.length,
    page,
    per_page,
  });
}
