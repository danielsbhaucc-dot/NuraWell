import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { HeadObjectCommand } from '@aws-sdk/client-s3';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { readJsonBody } from '@/lib/api/json-request';
import { audioTrackMetaSchema } from '@/lib/validation/admin-audio';
import { createAdminClient } from '@/lib/supabase/admin';
import { audioTrackObjectKey, getPublicCdnAudioUrl } from '@/lib/cdn/public-audio';
import { getR2Client, r2AudioBucketName } from '@/lib/storage/r2-almog';
import { copyR2Object } from '@/lib/storage/r2-copy';

export const runtime = 'nodejs';

const bodySchema = audioTrackMetaSchema.extend({
  source_object_key: z.string().min(1).max(1000),
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
    return NextResponse.json({ error: 'חסרה הגדרת אחסון אודיו.' }, { status: 500 });
  }

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;
  const parsed = bodySchema.safeParse(raw.value);
  if (!parsed.success) {
    return NextResponse.json({ error: 'פרטים לא תקינים' }, { status: 400 });
  }

  const sourceKey = parsed.data.source_object_key.replace(/^\/+/, '');
  if (sourceKey.includes('..')) {
    return NextResponse.json({ error: 'מפתח לא תקין' }, { status: 400 });
  }

  const trackId = randomUUID();
  const destKey = audioTrackObjectKey(playlistId, trackId);

  try {
    const s3 = getR2Client();
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: sourceKey }));
    await copyR2Object({
      bucket,
      fromKey: sourceKey,
      toKey: destKey,
      contentType: 'audio/mpeg',
      cacheControl: 'public, max-age=31536000, immutable',
    });
    const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: destKey }));
    const sizeBytes = head.ContentLength ?? 0;

    const admin = createAdminClient();
    const { data: playlist, error: pErr } = await admin
      .from('audio_playlists')
      .select('id')
      .eq('id', playlistId)
      .maybeSingle();
    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
    if (!playlist) return NextResponse.json({ error: 'פלייליסט לא נמצא' }, { status: 404 });

    const { data: lastRows } = await admin
      .from('audio_tracks')
      .select('sort_order')
      .eq('playlist_id', playlistId)
      .order('sort_order', { ascending: false })
      .limit(1);
    const nextSort = lastRows?.[0]?.sort_order != null ? Number(lastRows[0].sort_order) + 1 : 0;

    const { data: track, error: insErr } = await admin
      .from('audio_tracks')
      .insert({
        id: trackId,
        playlist_id: playlistId,
        title: parsed.data.title,
        object_key: destKey,
        mime_type: 'audio/mpeg',
        duration_seconds: parsed.data.duration_seconds ?? null,
        size_bytes: sizeBytes,
        sort_order: nextSort,
        credit: parsed.data.credit,
      })
      .select('id, playlist_id, title, object_key, mime_type, duration_seconds, size_bytes, sort_order, credit, created_at')
      .single();

    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

    return NextResponse.json({ ...track, url: getPublicCdnAudioUrl(destKey) });
  } catch (e) {
    console.error('[from-library]', e);
    return NextResponse.json({ error: 'הוספת רצועה מהספרייה נכשלה' }, { status: 500 });
  }
}
