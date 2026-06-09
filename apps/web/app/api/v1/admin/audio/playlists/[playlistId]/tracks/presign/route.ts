import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { consumeMultiRateLimits, rateLimitResponse } from '@/lib/api/rate-limit';
import { readJsonBody } from '@/lib/api/json-request';
import { audioTrackMetaSchema } from '@/lib/validation/admin-audio';
import { createAdminClient } from '@/lib/supabase/admin';
import { audioTrackObjectKey } from '@/lib/cdn/public-audio';
import { r2AudioBucketName } from '@/lib/storage/r2-almog';
import { createR2PutPresignedUrl } from '@/lib/storage/r2-presign';

export const runtime = 'nodejs';

const directUploadSchema = audioTrackMetaSchema.extend({
  size_bytes: z.number().int().min(1).max(25 * 1024 * 1024),
});

type RouteContext = { params: Promise<{ playlistId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const rl = await consumeMultiRateLimits(auth.user.id, 'admin-api', [
    { limit: 120, windowSeconds: 60 },
    { limit: 1000, windowSeconds: 3600 },
  ]);
  if (!rl.ok) return rateLimitResponse(rl);

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
  const parsed = directUploadSchema.safeParse(raw.value);
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

  const admin = createAdminClient();
  const { data: playlist, error } = await admin
    .from('audio_playlists')
    .select('id')
    .eq('id', playlistId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!playlist) return NextResponse.json({ error: 'פלייליסט לא נמצא' }, { status: 404 });

  const trackId = randomUUID();
  const objectKey = audioTrackObjectKey(playlistId, trackId);
  const uploadUrl = createR2PutPresignedUrl({
    bucket,
    key: objectKey,
    expiresSeconds: 300,
  });

  return NextResponse.json({
    track_id: trackId,
    object_key: objectKey,
    upload_url: uploadUrl,
    expires_in: 300,
  });
}
