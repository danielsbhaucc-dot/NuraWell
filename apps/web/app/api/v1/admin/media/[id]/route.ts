import { NextResponse } from 'next/server';
import { z } from 'zod';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { readJsonBody } from '@/lib/api/json-request';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolvePublicUrlForAsset } from '@/lib/cdn/public-media';
import { mediaAssetPatchSchema } from '@/lib/validation/media-asset';
import { getR2Client, r2BucketNameForMediaBucket } from '@/lib/storage/r2-almog';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'מזהה לא תקין' }, { status: 400 });
  }

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;
  const parsed = mediaAssetPatchSchema.safeParse(raw.value);
  if (!parsed.success) {
    return NextResponse.json({ error: 'שדות עריכה לא תקינים' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('media_assets')
    .update(parsed.data)
    .eq('id', id)
    .select('*')
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'לא נמצא' }, { status: 404 });

  const url = resolvePublicUrlForAsset(data);
  return NextResponse.json({ ...data, url });
}

export async function DELETE(request: Request, context: RouteContext) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'מזהה לא תקין' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: row, error: fetchErr } = await admin
    .from('media_assets')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: 'לא נמצא' }, { status: 404 });

  if (row.object_key && row.bucket) {
    const bucket = r2BucketNameForMediaBucket(row.bucket);
    if (bucket) {
      try {
        const s3 = getR2Client();
        await s3.send(
          new DeleteObjectCommand({
            Bucket: bucket,
            Key: row.object_key,
          })
        );
      } catch (e) {
        console.error('[media delete] R2 delete failed', e);
        return NextResponse.json({ error: 'מחיקה מ-R2 נכשלה' }, { status: 500 });
      }
    }
  }

  const { error: delErr } = await admin.from('media_assets').delete().eq('id', id);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, id });
}
