import { NextResponse } from 'next/server';
import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { getPublicCdnImageUrl } from '@/lib/cdn/public-images';
import { almogCdnHostname, resolveCdnImagesPrefix } from '@/lib/ai/almog-avatar';
import { getR2Client, r2ImageBucketName } from '@/lib/storage/r2-almog';
import { copyImageSourceToKey } from '@/lib/storage/apply-source-image';
import { readJsonBody } from '@/lib/api/json-request';
import { z } from 'zod';
import {
  LOGIN_BACKGROUND_LEGACY_KEYS,
  LOGIN_BACKGROUND_OBJECT_KEY,
} from '@/lib/storage/login-background';
import { stationCoverCreditSchema } from '@/lib/validation/admin-journey-station';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

const applyFromLibrarySchema = z
  .object({
    source_object_key: z.string().min(1).max(1000),
    credit: stationCoverCreditSchema.optional(),
  })
  .strict();

function isWebpBuffer(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  return buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP';
}

export async function GET(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const { supabase } = auth;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('site_settings')
    .select('login_background_key, login_background_credit, updated_at')
    .eq('id', 1)
    .maybeSingle();

  const key = data?.login_background_key ?? LOGIN_BACKGROUND_OBJECT_KEY;
  const url = getPublicCdnImageUrl(key, String(Date.now()));

  return NextResponse.json({
    object_key: key,
    cover_url: url,
    credit: data?.login_background_credit ?? null,
    cdn_hostname: almogCdnHostname(),
    public_object_path: `${resolveCdnImagesPrefix()}/${key}`,
  });
}

export async function POST(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

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
          destObjectKey: LOGIN_BACKGROUND_OBJECT_KEY,
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from('site_settings')
          .update({
            login_background_key: LOGIN_BACKGROUND_OBJECT_KEY,
            login_background_credit: lib.data.credit ?? null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', 1);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({
          ok: true,
          cover_url: getPublicCdnImageUrl(LOGIN_BACKGROUND_OBJECT_KEY, String(Date.now())),
          object_key: LOGIN_BACKGROUND_OBJECT_KEY,
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
    const { data: settings } = await (supabase as any)
      .from('site_settings')
      .select('login_background_key')
      .eq('id', 1)
      .maybeSingle();

    const oldKey = settings?.login_background_key as string | undefined;
    if (oldKey && oldKey !== LOGIN_BACKGROUND_OBJECT_KEY) {
      try {
        await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: oldKey }));
      } catch {
        /* ignore */
      }
    }

    for (const legacy of LOGIN_BACKGROUND_LEGACY_KEYS) {
      try {
        await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: legacy }));
      } catch {
        /* ignore */
      }
    }

    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: LOGIN_BACKGROUND_OBJECT_KEY,
        Body: buf,
        ContentType: 'image/webp',
        CacheControl: 'public, max-age=31536000, immutable',
      })
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('site_settings')
      .update({
        login_background_key: LOGIN_BACKGROUND_OBJECT_KEY,
        login_background_credit: creditParsed.data,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const version = Date.now().toString();
    return NextResponse.json({
      ok: true,
      cover_url: getPublicCdnImageUrl(LOGIN_BACKGROUND_OBJECT_KEY, version),
      object_key: LOGIN_BACKGROUND_OBJECT_KEY,
      cdn_hostname: almogCdnHostname(),
    });
  } catch (e) {
    console.error('[login-background POST]', e);
    return NextResponse.json({ error: 'העלאה נכשלה' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const bucket = r2ImageBucketName();
  if (!bucket) {
    return NextResponse.json({ error: 'חסר אחסון' }, { status: 500 });
  }

  const s3 = getR2Client();
  const keys = [LOGIN_BACKGROUND_OBJECT_KEY, ...LOGIN_BACKGROUND_LEGACY_KEYS];
  for (const key of keys) {
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    } catch {
      /* ignore */
    }
  }

  const { supabase } = auth;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('site_settings')
    .update({
      login_background_key: null,
      login_background_credit: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', 1);

  return NextResponse.json({ ok: true });
}
