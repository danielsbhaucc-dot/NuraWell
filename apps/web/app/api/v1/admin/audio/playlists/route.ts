import { NextResponse } from 'next/server';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { readJsonBody } from '@/lib/api/json-request';
import { createAdminClient } from '@/lib/supabase/admin';
import { audioPlaylistCreateSchema } from '@/lib/validation/admin-audio';
import { jsonZodError } from '@/lib/validation/zod-http';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from('audio_playlists')
    .select('id, title, description, is_published, created_at, updated_at, audio_tracks(count)')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const playlists = (data ?? []).map((row: any) => {
    const { audio_tracks, ...rest } = row;
    const track_count = Array.isArray(audio_tracks) && audio_tracks[0] ? Number(audio_tracks[0].count ?? 0) : 0;
    return { ...rest, track_count };
  });

  return NextResponse.json(playlists);
}

export async function POST(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;

  const parsed = audioPlaylistCreateSchema.safeParse(raw.value);
  if (!parsed.success) return jsonZodError(parsed.error);

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from('audio_playlists')
    .insert({
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      is_published: parsed.data.is_published ?? false,
    })
    .select('id, title, description, is_published, created_at, updated_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ...data, track_count: 0 });
}
