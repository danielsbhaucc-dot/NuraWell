import { NextResponse } from 'next/server';
import { z } from 'zod';
import { DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { readJsonBody } from '@/lib/api/json-request';
import { createAdminClient } from '@/lib/supabase/admin';
import { audioPlaylistUpdateSchema } from '@/lib/validation/admin-audio';
import { jsonZodError } from '@/lib/validation/zod-http';
import { getR2Client, r2AudioBucketName } from '@/lib/storage/r2-almog';
import { getPublicCdnAudioUrl } from '@/lib/cdn/public-audio';

export const runtime = 'nodejs';
export const maxDuration = 60;

type RouteContext = { params: Promise<{ playlistId: string }> };

async function resolvePlaylistId(context: RouteContext): Promise<string | null> {
  const { playlistId } = await context.params;
  return z.string().uuid().safeParse(playlistId).success ? playlistId : null;
}

export async function GET(request: Request, context: RouteContext) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const playlistId = await resolvePlaylistId(context);
  if (!playlistId) return NextResponse.json({ error: 'מזהה פלייליסט לא תקין' }, { status: 400 });

  const admin = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: playlist, error: pErr } = await (admin as any)
    .from('audio_playlists')
    .select('id, title, description, is_published, created_at, updated_at')
    .eq('id', playlistId)
    .maybeSingle();

  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
  if (!playlist) return NextResponse.json({ error: 'פלייליסט לא נמצא' }, { status: 404 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: tracks, error: tErr } = await (admin as any)
    .from('audio_tracks')
    .select('id, playlist_id, title, object_key, mime_type, duration_seconds, size_bytes, sort_order, credit, created_at')
    .eq('playlist_id', playlistId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const withUrls = (tracks ?? []).map((t: any) => ({
    ...t,
    url: getPublicCdnAudioUrl(t.object_key),
  }));

  return NextResponse.json({ playlist, tracks: withUrls });
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const playlistId = await resolvePlaylistId(context);
  if (!playlistId) return NextResponse.json({ error: 'מזהה פלייליסט לא תקין' }, { status: 400 });

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;
  const parsed = audioPlaylistUpdateSchema.safeParse(raw.value);
  if (!parsed.success) return jsonZodError(parsed.error);

  const update = Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined));
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'אין שדות לעדכון' }, { status: 400 });
  }

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from('audio_playlists')
    .update({ ...update, updated_at: new Date().toISOString() })
    .eq('id', playlistId)
    .select('id, title, description, is_published, created_at, updated_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(request: Request, context: RouteContext) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const playlistId = await resolvePlaylistId(context);
  if (!playlistId) return NextResponse.json({ error: 'מזהה פלייליסט לא תקין' }, { status: 400 });

  const admin = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: tracks, error: tErr } = await (admin as any)
    .from('audio_tracks')
    .select('object_key')
    .eq('playlist_id', playlistId);

  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });

  // מחיקת כל קבצי האודיו מ-R2 לפני מחיקת הפלייליסט (cascade ימחק את הרצועות ב-DB)
  const bucket = r2AudioBucketName();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const keys = (tracks ?? []).map((t: any) => t.object_key as string).filter(Boolean);
  if (bucket && keys.length > 0) {
    try {
      const s3 = getR2Client();
      // DeleteObjects תומך עד 1000 מפתחות בבת אחת
      await s3.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: keys.map((Key: string) => ({ Key })) },
        })
      );
    } catch (e) {
      console.error('[audio-playlist DELETE] R2 cleanup failed', e);
      /* ממשיכים למחוק את ה-DB גם אם R2 נכשל חלקית */
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any).from('audio_playlists').delete().eq('id', playlistId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
