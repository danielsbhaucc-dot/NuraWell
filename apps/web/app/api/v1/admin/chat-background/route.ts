import { NextResponse } from 'next/server';
import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { getPublicCdnImageUrl } from '@/lib/cdn/public-images';
import { almogCdnHostname, resolveCdnImagesPrefix } from '@/lib/ai/almog-avatar';
import { getR2Client, r2ImageBucketName } from '@/lib/storage/r2-almog';
import { copyImageSourceToKey } from '@/lib/storage/apply-source-image';
import { readJsonBody } from '@/lib/api/json-request';
import {
  CHAT_BACKGROUND_LEGACY_KEYS,
  CHAT_BACKGROUND_OBJECT_KEY,
} from '@/lib/storage/chat-background';
import { stationCoverCreditSchema } from '@/lib/validation/admin-journey-station';
import { consumeMultiRateLimits, rateLimitResponse } from '@/lib/api/rate-limit';
import { isWebpBuffer, MAX_UPLOAD_BYTES } from '@/lib/validation/webp';
import { applyFromLibrarySchema } from '@/lib/validation/admin-image-upload';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const rl = await consumeMultiRateLimits(auth.user.id, 'admin-api', [
    { limit: 120, windowSeconds: 60 },
    { limit: 1000, windowSeconds: 3600 },
  ]);
  if (!rl.ok) return rateLimitResponse(rl);

  const { supabase } = auth;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await supabase
    .from('site_settings')
    .select('chat_background_key, chat_background_credit, updated_at')
    .eq('id', 1)
    .maybeSingle();

  const key = data?.chat_background_key ?? CHAT_BACKGROUND_OBJECT_KEY;
  const url = getPublicCdnImageUrl(key, String(Date.now()));

  return NextResponse.json({
    object_key: key,
    cover_url: url,
    credit: data?.chat_background_credit ?? null,
    cdn_hostname: almogCdnHostname(),
    public_object_path: `${resolveCdnImagesPrefix()}/${key}`,
  });
}

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
      return NextResponse.json({ error: 'חסרה הגדרת אחסון תמונות.' }, { status: 500 });
    }

    const s3 = getR2Client();
    const { supabase } = auth;

    const ct = request.headers.get('content-type') ?? '';
    if (ct.includes('application/json')) {
      const raw = await readJsonBody(request);
      if (!raw.ok) return raw.response;
      const lib = applyFromLibrarySchema.safeParse(raw.value);
      if (lib.success) {
        await copyImageSourceToKey({
          sourceObjectKey: lib.data.source_object_key,
          destObjectKey: CHAT_BACKGROUND_OBJECT_KEY,
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await supabase
          .from('site_settings')
          .update({
            chat_background_key: CHAT_BACKGROUND_OBJECT_KEY,
            chat_background_credit: lib.data.credit ?? null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', 1);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({
          ok: true,
          cover_url: getPublicCdnImageUrl(CHAT_BACKGROUND_OBJECT_KEY, String(Date.now())),
          object_key: CHAT_BACKGROUND_OBJECT_KEY,
        });
      }
    }

    const form = await request.formData();
    const file = form.get('file');
    const creditRaw = form.get('credit');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'לא נבחר קובץ' }, { status: 400 });
    }

    let creditJson: unknown;
    try {
      creditJson = typeof creditRaw === 'string' ? JSON.parse(creditRaw) : null;
    } catch {
      return NextResponse.json({ error: 'קרדיט לא תקין' }, { status: 400 });
    }
    const creditParsed = stationCoverCreditSchema.safeParse(creditJson);
    if (!creditParsed.success) {
      return NextResponse.json({ error: 'קרדיט לא תקין' }, { status: 400 });
    }

    if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: 'קובץ גדול מדי' }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    if (!isWebpBuffer(buf)) {
      return NextResponse.json({ error: 'נדרש WebP' }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: settings } = await supabase
      .from('site_settings')
      .select('chat_background_key')
      .eq('id', 1)
      .maybeSingle();

    const oldKey = settings?.chat_background_key as string | undefined;
    if (oldKey && oldKey !== CHAT_BACKGROUND_OBJECT_KEY) {
      try {
        await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: oldKey }));
      } catch {
        /* ignore */
      }
    }

    for (const legacy of CHAT_BACKGROUND_LEGACY_KEYS) {
      try {
        await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: legacy }));
      } catch {
        /* ignore */
      }
    }

    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: CHAT_BACKGROUND_OBJECT_KEY,
        Body: buf,
        ContentType: 'image/webp',
        CacheControl: 'public, max-age=31536000, immutable',
      })
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await supabase
      .from('site_settings')
      .update({
        chat_background_key: CHAT_BACKGROUND_OBJECT_KEY,
        chat_background_credit: creditParsed.data,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const version = Date.now().toString();
    return NextResponse.json({
      ok: true,
      cover_url: getPublicCdnImageUrl(CHAT_BACKGROUND_OBJECT_KEY, version),
      object_key: CHAT_BACKGROUND_OBJECT_KEY,
      cdn_hostname: almogCdnHostname(),
    });
  } catch (e) {
    console.error('[chat-background POST]', e);
    return NextResponse.json({ error: 'העלאה נכשלה' }, { status: 500 });
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

  const bucket = r2ImageBucketName();
  if (!bucket) {
    return NextResponse.json({ error: 'חסר אחסון' }, { status: 500 });
  }

  const s3 = getR2Client();
  const keys = [CHAT_BACKGROUND_OBJECT_KEY, ...CHAT_BACKGROUND_LEGACY_KEYS];
  for (const key of keys) {
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    } catch {
      /* ignore */
    }
  }

  const { supabase } = auth;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await supabase
    .from('site_settings')
    .update({
      chat_background_key: null,
      chat_background_credit: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', 1);

  return NextResponse.json({ ok: true });
}
