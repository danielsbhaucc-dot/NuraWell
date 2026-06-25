import { NextResponse } from 'next/server';
import { DeleteObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

import { requireApiSession } from '../../../../../lib/api/route-guards';
import { getR2Client, r2ImageBucketName } from '../../../../../lib/storage/r2-almog';
import {
  getUserAvatarCdnUrl,
  userAvatarLegacyKeys,
  userAvatarObjectKey,
} from '../../../../../lib/storage/user-avatar';
import { isWebpBuffer, MAX_UPLOAD_BYTES } from '../../../../../lib/validation/webp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;

  const bucket = r2ImageBucketName();
  const cdnUrl = getUserAvatarCdnUrl(auth.user.id);

  if (!bucket || !cdnUrl) {
    return NextResponse.json(
      { avatar_url: null, has_custom: false },
      { headers: { 'Cache-Control': 'private, max-age=60' } }
    );
  }

  try {
    const s3 = getR2Client();
    const head = await s3.send(
      new HeadObjectCommand({ Bucket: bucket, Key: userAvatarObjectKey(auth.user.id) })
    );
    const v = String(head.LastModified?.getTime() ?? Date.now());
    return NextResponse.json(
      {
        avatar_url: getUserAvatarCdnUrl(auth.user.id, v),
        has_custom: true,
      },
      { headers: { 'Cache-Control': 'private, max-age=3600, stale-while-revalidate=86400' } }
    );
  } catch {
    return NextResponse.json(
      { avatar_url: null, has_custom: false },
      { headers: { 'Cache-Control': 'private, max-age=300' } }
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;

  try {
    const bucket = r2ImageBucketName();
    if (!bucket) {
      return NextResponse.json({ error: 'אחסון תמונות לא מוגדר' }, { status: 500 });
    }

    const form = await request.formData();
    const file = form.get('file');
    const originalBytesRaw = form.get('original_bytes');
    const originalBytesParsed =
      typeof originalBytesRaw === 'string' ? Number.parseInt(originalBytesRaw, 10) : NaN;

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'לא נבחר קובץ' }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    if (buf.length <= 0) {
      return NextResponse.json({ error: 'קובץ ריק' }, { status: 400 });
    }
    if (buf.length > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: 'הקובץ גדול מדי — נסה שוב' }, { status: 400 });
    }
    if (!isWebpBuffer(buf)) {
      return NextResponse.json({ error: 'פורמט לא נתמך — רק WebP' }, { status: 400 });
    }

    const s3 = getR2Client();
    const objectKey = userAvatarObjectKey(auth.user.id);

    for (const key of userAvatarLegacyKeys(auth.user.id)) {
      try {
        await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      } catch {
        /* ignore */
      }
    }

    try {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }));
    } catch {
      /* ignore */
    }

    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: objectKey,
        Body: buf,
        ContentType: 'image/webp',
        CacheControl: 'public, max-age=31536000, immutable',
      })
    );

    const version = Date.now().toString();
    const avatar_url = getUserAvatarCdnUrl(auth.user.id, version);

    await auth.supabase
      .from('profiles')
      .update({ avatar_url, updated_at: new Date().toISOString() })
      .eq('id', auth.user.id);

    const originalForStats =
      Number.isFinite(originalBytesParsed) && originalBytesParsed > 0
        ? originalBytesParsed
        : file.size;

    return NextResponse.json({
      ok: true,
      avatar_url,
      original_bytes: originalForStats,
      optimized_bytes: buf.length,
      saved_percent: Math.max(
        0,
        Math.round((1 - buf.length / Math.max(1, originalForStats)) * 100)
      ),
    });
  } catch (error) {
    console.error('[profile avatar POST]', error);
    return NextResponse.json({ error: 'העלאה נכשלה' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;

  try {
    const bucket = r2ImageBucketName();
    if (bucket) {
      const s3 = getR2Client();
      const keys = [userAvatarObjectKey(auth.user.id), ...userAvatarLegacyKeys(auth.user.id)];
      for (const key of keys) {
        try {
          await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
        } catch {
          /* ignore */
        }
      }
    }

    await auth.supabase
      .from('profiles')
      .update({ avatar_url: null, updated_at: new Date().toISOString() })
      .eq('id', auth.user.id);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[profile avatar DELETE]', error);
    return NextResponse.json({ error: 'מחיקה נכשלה' }, { status: 500 });
  }
}
