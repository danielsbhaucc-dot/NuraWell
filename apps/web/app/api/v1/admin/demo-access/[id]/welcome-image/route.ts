import { NextResponse } from 'next/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { z } from 'zod';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { consumeMultiRateLimits, rateLimitResponse } from '@/lib/api/rate-limit';
import { getR2Client, r2ImageBucketName } from '@/lib/module-api/site-content/lib-storage-r2-almog';
import { getPublicCdnImageUrl, deleteImageFromR2 } from '@/lib/module-api/site-content/lib-cdn-public-images';
import { isWebpBuffer, MAX_UPLOAD_BYTES } from '@/lib/validation/webp';
import { createAdminClient } from '@/lib/supabase/admin';
import { demoWelcomeImageObjectKey } from '@/lib/demo-access/welcome-image';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const idSchema = z.string().uuid();

type RouteCtx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: RouteCtx) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const rl = await consumeMultiRateLimits(auth.user.id, 'admin-api', [
    { limit: 30, windowSeconds: 60 },
  ]);
  if (!rl.ok) return rateLimitResponse(rl);

  const { id } = await ctx.params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: 'מזהה לא תקין' }, { status: 400 });
  }

  const bucket = r2ImageBucketName();
  if (!bucket) {
    return NextResponse.json({ error: 'חסרה הגדרת אחסון תמונות.' }, { status: 500 });
  }

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: link } = await (admin as any)
    .from('demo_access_links')
    .select('id, welcome_image_key')
    .eq('id', id)
    .maybeSingle();
  if (!link) {
    return NextResponse.json({ error: 'קישור לא נמצא' }, { status: 404 });
  }

  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'חסר קובץ תמונה (WebP).' }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: 'הקובץ גדול מדי (מקסימום 2MB אחרי דחיסה).' }, { status: 400 });
  }
  if (!isWebpBuffer(buf)) {
    return NextResponse.json({ error: 'יש להעלות WebP בלבד (דחיסה בדפדפן).' }, { status: 400 });
  }

  const objectKey = demoWelcomeImageObjectKey(id);
  const s3 = getR2Client();
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      Body: buf,
      ContentType: 'image/webp',
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  );

  const nowIso = new Date().toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any)
    .from('demo_access_links')
    .update({ welcome_image_key: objectKey, updated_at: nowIso })
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    object_key: objectKey,
    cover_url: getPublicCdnImageUrl(objectKey, String(Date.now())),
  });
}

export async function DELETE(request: Request, ctx: RouteCtx) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: 'מזהה לא תקין' }, { status: 400 });
  }

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: link } = await (admin as any)
    .from('demo_access_links')
    .select('id, welcome_image_key')
    .eq('id', id)
    .maybeSingle();
  if (!link) {
    return NextResponse.json({ error: 'קישור לא נמצא' }, { status: 404 });
  }

  if (link.welcome_image_key) {
    await deleteImageFromR2(link.welcome_image_key);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin as any)
    .from('demo_access_links')
    .update({ welcome_image_key: null, updated_at: new Date().toISOString() })
    .eq('id', id);

  return NextResponse.json({ ok: true });
}
