import { NextResponse } from 'next/server';
import { z } from 'zod';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { readJsonBody } from '@/lib/api/json-request';
import { createAdminClient } from '@/lib/supabase/admin';
import { audioTrackUpdateSchema } from '@/lib/validation/admin-audio';
import { jsonZodError } from '@/lib/validation/zod-http';
import { getR2Client, r2AudioBucketName } from '@/lib/storage/r2-almog';
import { getPublicCdnAudioUrl } from '@/lib/cdn/public-audio';

export const runtime = 'nodejs';
export const maxDuration = 60;

type RouteContext = { params: Promise<{ trackId: string }> };

async function resolveTrackId(context: RouteContext): Promise<string | null> {
  const { trackId } = await context.params;
  return z.string().uuid().safeParse(trackId).success ? trackId : null;
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const trackId = await resolveTrackId(context);
  if (!trackId) return NextResponse.json({ error: 'מזהה רצועה לא תקין' }, { status: 400 });

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;
  const parsed = audioTrackUpdateSchema.safeParse(raw.value);
  if (!parsed.success) return jsonZodError(parsed.error);

  const update = Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined));
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'אין שדות לעדכון' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('audio_tracks')
    .update(update)
    .eq('id', trackId)
    .select('id, playlist_id, title, object_key, mime_type, duration_seconds, size_bytes, sort_order, credit, created_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ...data, url: getPublicCdnAudioUrl(data.object_key) });
}

export async function DELETE(request: Request, context: RouteContext) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const trackId = await resolveTrackId(context);
  if (!trackId) return NextResponse.json({ error: 'מזהה רצועה לא תקין' }, { status: 400 });

  const admin = createAdminClient();

  const { data: track, error: readErr } = await admin
    .from('audio_tracks')
    .select('id, object_key')
    .eq('id', trackId)
    .maybeSingle();

  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  if (!track) return NextResponse.json({ error: 'רצועה לא נמצאה' }, { status: 404 });

  const bucket = r2AudioBucketName();
  if (bucket && track.object_key) {
    try {
      const s3 = getR2Client();
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: track.object_key }));
    } catch (e) {
      console.error('[audio-track DELETE] R2 delete failed', e);
      /* ממשיכים למחוק את הרשומה גם אם הקובץ כבר לא קיים */
    }
  }

  const { error } = await admin.from('audio_tracks').delete().eq('id', trackId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
