import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { createAdminClient } from '@/lib/supabase/admin';
import { audioTrackMetaSchema } from '@/lib/validation/admin-audio';
import { getR2Client, r2AudioBucketName } from '@/lib/storage/r2-almog';
import { audioTrackObjectKey, getPublicCdnAudioUrl } from '@/lib/cdn/public-audio';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** מגבלת Vercel לגוף בקשה היא ~4.5MB; שומרים מרווח בטחון. */
const MAX_AUDIO_UPLOAD_BYTES = 4 * 1024 * 1024;

type RouteContext = { params: Promise<{ playlistId: string }> };

/** אימות שזה אכן MP3 (ID3 tag או MPEG frame sync). */
function isMp3Buffer(buf: Buffer): boolean {
  if (buf.length < 3) return false;
  if (buf.subarray(0, 3).toString('ascii') === 'ID3') return true;
  // MPEG audio frame sync: 11 bits set (0xFF 0xEx/0xFx)
  return buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0;
}

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

  const admin = createAdminClient();

  // ודא שהפלייליסט קיים
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: playlist, error: pErr } = await (admin as any)
    .from('audio_playlists')
    .select('id')
    .eq('id', playlistId)
    .maybeSingle();
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
  if (!playlist) return NextResponse.json({ error: 'פלייליסט לא נמצא' }, { status: 404 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'קובץ גדול מדי או בקשה לא תקינה.' }, { status: 413 });
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'לא נבחר קובץ' }, { status: 400 });
  }
  if (file.size <= 0 || file.size > MAX_AUDIO_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: 'הקובץ גדול מדי אחרי דחיסה. נסה רצועה קצרה יותר או באיכות נמוכה יותר.' },
      { status: 400 }
    );
  }

  // מטא-דאטה
  const durationRaw = form.get('duration_seconds');
  const durationParsed = typeof durationRaw === 'string' ? Number.parseFloat(durationRaw) : NaN;
  let creditJson: unknown;
  try {
    const creditRaw = form.get('credit');
    creditJson = typeof creditRaw === 'string' ? JSON.parse(creditRaw) : null;
  } catch {
    return NextResponse.json({ error: 'פרטי קרדיט לא תקינים' }, { status: 400 });
  }

  const metaParsed = audioTrackMetaSchema.safeParse({
    title: form.get('title'),
    duration_seconds: Number.isFinite(durationParsed) ? durationParsed : null,
    credit: creditJson,
  });
  if (!metaParsed.success) {
    return NextResponse.json({ error: 'פרטי הרצועה/קרדיט חסרים או לא תקינים' }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  if (!isMp3Buffer(buf)) {
    return NextResponse.json({ error: 'הקובץ חייב להיות MP3 (לאחר דחיסה בדפדפן).' }, { status: 400 });
  }

  const trackId = randomUUID();
  const objectKey = audioTrackObjectKey(playlistId, trackId);

  try {
    const s3 = getR2Client();
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: objectKey,
        Body: buf,
        ContentType: 'audio/mpeg',
        CacheControl: 'public, max-age=31536000, immutable',
      })
    );
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: objectKey }));
  } catch (e) {
    console.error('[audio-track upload] R2 put failed', e);
    return NextResponse.json({ error: 'העלאת האודיו ל-R2 נכשלה.' }, { status: 500 });
  }

  // סדר הבא בפלייליסט
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
      id: trackId,
      playlist_id: playlistId,
      title: metaParsed.data.title,
      object_key: objectKey,
      mime_type: 'audio/mpeg',
      duration_seconds: metaParsed.data.duration_seconds ?? null,
      size_bytes: buf.length,
      sort_order: nextSort,
      credit: metaParsed.data.credit,
    })
    .select('id, playlist_id, title, object_key, mime_type, duration_seconds, size_bytes, sort_order, credit, created_at')
    .single();

  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({ ...track, url: getPublicCdnAudioUrl(objectKey) });
}
