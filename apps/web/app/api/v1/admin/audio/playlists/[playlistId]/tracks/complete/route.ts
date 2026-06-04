import { NextResponse } from 'next/server';
import { z } from 'zod';
import { HeadObjectCommand } from '@aws-sdk/client-s3';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { readJsonBody } from '@/lib/api/json-request';
import { audioTrackMetaSchema } from '@/lib/validation/admin-audio';
import { createAdminClient } from '@/lib/supabase/admin';
import { audioTrackObjectKey, getPublicCdnAudioUrl } from '@/lib/cdn/public-audio';
import { getR2Client, r2AudioBucketName } from '@/lib/storage/r2-almog';

export const runtime = 'nodejs';
export const maxDuration = 30;

const completeSchema = audioTrackMetaSchema.extend({
  track_id: z.string().uuid(),
  object_key: z.string().min(1).max(1000),
  size_bytes: z.number().int().min(1).max(25 * 1024 * 1024),
});

type RouteContext = { params: Promise<{ playlistId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const { playlistId } = await context.params;
  if (!z.string().uuid().safeParse(playlistId).success) {
    return NextResponse.json({ error: 'מזהה פלייליסט לא תקין' }, { status: 400 });
  }

  const bucket = r2AudioBucketName();
  if (!bucket) {
    return NextResponse.json({ error: 'חסרה הגדרת אחסון אודיו בשרת (R2_AUDIO_BUCKET_NAME).' }, { status: 500 });
  }

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;
  const parsed = completeSchema.safeParse(raw.value);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'פרטי הרצועה/קרדיט חסרים או לא תקינים',
        details: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
      { status: 400 }
    );
  }

  const expectedKey = audioTrackObjectKey(playlistId, parsed.data.track_id);
  if (parsed.data.object_key !== expectedKey) {
    return NextResponse.json({ error: 'מפתח האודיו לא תואם לפלייליסט' }, { status: 400 });
  }

  try {
    const s3 = getR2Client();
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: parsed.data.object_key }));
  } catch (e) {
    console.error('[audio-track complete] R2 head failed', e);
    return NextResponse.json({ error: 'האודיו עדיין לא נמצא ב-R2. נסה שוב בעוד רגע.' }, { status: 409 });
  }

  const admin = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: playlist, error: pErr } = await (admin as any)
    .from('audio_playlists')
    .select('id')
    .eq('id', playlistId)
    .maybeSingle();
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
  if (!playlist) return NextResponse.json({ error: 'פלייליסט לא נמצא' }, { status: 404 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: lastRows } = await (admin as any)
    .from('audio_tracks')
    .select('sort_order')
    .eq('playlist_id', playlistId)
    .order('sort_order', { ascending: false })
    .limit(1);
  const nextSort = lastRows?.[0]?.sort_order != null ? Number(lastRows[0].sort_order) + 1 : 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: track, error: insErr } = await (admin as any)
    .from('audio_tracks')
    .insert({
      id: parsed.data.track_id,
      playlist_id: playlistId,
      title: parsed.data.title,
      object_key: parsed.data.object_key,
      mime_type: 'audio/mpeg',
      duration_seconds: parsed.data.duration_seconds ?? null,
      size_bytes: parsed.data.size_bytes,
      sort_order: nextSort,
      credit: parsed.data.credit,
    })
    .select('id, playlist_id, title, object_key, mime_type, duration_seconds, size_bytes, sort_order, credit, created_at')
    .single();

  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({ ...track, url: getPublicCdnAudioUrl(parsed.data.object_key) });
}
