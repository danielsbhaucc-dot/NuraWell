import { NextResponse } from 'next/server';
import { z } from 'zod';
import { DeleteObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { getPublicCdnImageUrl, journeyStationCoverObjectKey } from '@/lib/cdn/public-images';
import { almogCdnHostname, resolveCdnImagesPrefix } from '@/lib/ai/almog-avatar';
import { getR2Client, r2ImageBucketName } from '@/lib/storage/r2-almog';
import { copyImageSourceToKey } from '@/lib/storage/apply-source-image';
import { stationCoverCreditSchema } from '@/lib/validation/admin-journey-station';
import { readJsonBody } from '@/lib/api/json-request';
import { consumeMultiRateLimits, rateLimitResponse } from '@/lib/api/rate-limit';
import { isWebpBuffer, MAX_UPLOAD_BYTES } from '@/lib/validation/webp';

export const runtime = 'nodejs';
export const maxDuration = 60;

const deleteBodySchema = z.object({ station_id: z.string().uuid() }).strict();

const applyFromLibrarySchema = z
  .object({
    station_id: z.string().uuid(),
    source_object_key: z.string().min(1).max(1000),
    credit: stationCoverCreditSchema.optional(),
  })
  .strict();

export async function POST(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const rl = await consumeMultiRateLimits(auth.user.id, 'admin-api', [
    { limit: 120, windowSeconds: 60 },
    { limit: 1000, windowSeconds: 3600 },
  ]);
  if (!rl.ok) return rateLimitResponse(rl);

  try {
    const bucket = r2ImageBucketName();
    if (!bucket) {
      return NextResponse.json({ error: 'חסרה הגדרת אחסון תמונות בשרת.' }, { status: 500 });
    }

    const ct = request.headers.get('content-type') ?? '';
    if (ct.includes('application/json')) {
      const raw = await readJsonBody(request);
      if (!raw.ok) return raw.response;
      const lib = applyFromLibrarySchema.safeParse(raw.value);
      if (!lib.success) {
        return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 });
      }
      {
        const stationId = lib.data.station_id;
        const objectKey = journeyStationCoverObjectKey(stationId);
        await copyImageSourceToKey({
          sourceObjectKey: lib.data.source_object_key,
          destObjectKey: objectKey,
        });
        const { supabase } = auth;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await supabase
          .from('journey_stations')
          .update({
            cover_image_key: objectKey,
            cover_image_credit: lib.data.credit ?? null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', stationId)
          .select('id, title, cover_image_key, cover_image_credit')
          .single();
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        const cover_url = getPublicCdnImageUrl(objectKey, String(Date.now()));
        return NextResponse.json({
          ok: true,
          station: data,
          cover_url,
          object_key: objectKey,
        });
      }
    }

    const form = await request.formData();
    const file = form.get('file');
    const stationIdRaw = form.get('station_id');
    const creditRaw = form.get('credit');
    const originalBytesRaw = form.get('original_bytes');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'לא נבחר קובץ' }, { status: 400 });
    }
    if (typeof stationIdRaw !== 'string') {
      return NextResponse.json({ error: 'חסר מזהה תחנה' }, { status: 400 });
    }
    const stationIdParsed = z.string().uuid().safeParse(stationIdRaw);
    if (!stationIdParsed.success) {
      return NextResponse.json({ error: 'מזהה תחנה לא תקין' }, { status: 400 });
    }

    let creditJson: unknown;
    try {
      creditJson = typeof creditRaw === 'string' ? JSON.parse(creditRaw) : null;
    } catch {
      return NextResponse.json({ error: 'קרדיט תמונה לא תקין' }, { status: 400 });
    }
    const creditParsed = stationCoverCreditSchema.safeParse(creditJson);
    if (!creditParsed.success) {
      return NextResponse.json({ error: 'קרדיט תמונה לא תקין' }, { status: 400 });
    }

    if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: 'הקובץ גדול מדי אחרי הכנה. נסה תמונה קטנה יותר.' }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    if (!isWebpBuffer(buf)) {
      return NextResponse.json({ error: 'הקובץ חייב להיות WebP לאחר הכנה בדפדפן.' }, { status: 400 });
    }

    const originalBytesParsed =
      typeof originalBytesRaw === 'string' ? Number.parseInt(originalBytesRaw, 10) : NaN;
    const originalForStats =
      Number.isFinite(originalBytesParsed) && originalBytesParsed > 0 ? originalBytesParsed : file.size;

    const stationId = stationIdParsed.data;
    const objectKey = journeyStationCoverObjectKey(stationId);
    const s3 = getR2Client();

    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: objectKey,
        Body: buf,
        ContentType: 'image/webp',
        CacheControl: 'public, max-age=31536000, immutable',
      })
    );

    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: objectKey }));

    const { supabase } = auth;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await supabase
      .from('journey_stations')
      .update({
        cover_image_key: objectKey,
        cover_image_credit: creditParsed.data,
        updated_at: new Date().toISOString(),
      })
      .eq('id', stationId)
      .select('id, title, cover_image_key, cover_image_credit')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const version = Date.now().toString();
    const cover_url = getPublicCdnImageUrl(objectKey, version);

    return NextResponse.json({
      ok: true,
      station: data,
      cover_url,
      cdn_hostname: almogCdnHostname(),
      public_object_path: `${resolveCdnImagesPrefix()}/${objectKey}`,
      object_key: objectKey,
      original_bytes: originalForStats,
      optimized_bytes: buf.length,
      saved_percent: Math.max(0, Math.round((1 - buf.length / Math.max(1, originalForStats)) * 100)),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[journey-station-cover POST]', msg);
    return NextResponse.json({ error: 'העלאת תמונת תחנה נכשלה.' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const rl = await consumeMultiRateLimits(auth.user.id, 'admin-api', [
    { limit: 120, windowSeconds: 60 },
    { limit: 1000, windowSeconds: 3600 },
  ]);
  if (!rl.ok) return rateLimitResponse(rl);

  const raw = await request.json().catch(() => null);
  const parsed = deleteBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'מזהה תחנה לא תקין' }, { status: 400 });
  }

  const stationId = parsed.data.station_id;
  const { supabase } = auth;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: station, error: readError } = await supabase
    .from('journey_stations')
    .select('id, cover_image_key')
    .eq('id', stationId)
    .maybeSingle();

  if (readError) {
    return NextResponse.json({ error: readError.message }, { status: 500 });
  }
  if (!station) {
    return NextResponse.json({ error: 'תחנה לא נמצאה' }, { status: 404 });
  }

  const bucket = r2ImageBucketName();
  const objectKey = station.cover_image_key as string | null;
  if (bucket && objectKey) {
    try {
      const s3 = getR2Client();
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }));
    } catch {
      /* ignore missing object */
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await supabase
    .from('journey_stations')
    .update({
      cover_image_key: null,
      cover_image_credit: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', stationId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
