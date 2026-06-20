import { NextResponse } from 'next/server';
import { z } from 'zod';
import { generateAltTextForImage } from '@/lib/a11y/generate-alt-text';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { readJsonBody } from '@/lib/api/json-request';
import { consumeMultiRateLimits, rateLimitResponse } from '@/lib/api/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolvePublicUrlForAsset } from '@/lib/cdn/public-media';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const bodySchema = z.object({
  assetId: z.string().uuid(),
  save: z.boolean().optional(),
});

export async function POST(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const rl = await consumeMultiRateLimits(auth.user.id, 'admin-api', [
    { limit: 30, windowSeconds: 60 },
    { limit: 200, windowSeconds: 3600 },
  ]);
  if (!rl.ok) return rateLimitResponse(rl);

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;
  const parsed = bodySchema.safeParse(raw.value);
  if (!parsed.success) {
    return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: asset, error } = await admin
    .from('media_assets')
    .select('*')
    .eq('id', parsed.data.assetId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!asset) return NextResponse.json({ error: 'לא נמצא' }, { status: 404 });
  if (asset.kind !== 'image') {
    return NextResponse.json({ error: 'ניתן ליצור alt רק לתמונות' }, { status: 400 });
  }

  const imageUrl = resolvePublicUrlForAsset(asset);
  if (!imageUrl) {
    return NextResponse.json({ error: 'לא נמצא URL ציבורי לתמונה' }, { status: 400 });
  }

  try {
    const altText = await generateAltTextForImage({
      imageUrl,
      title: asset.title,
      context: asset.folder,
    });

    if (parsed.data.save) {
      const { data: updated, error: updateError } = await admin
        .from('media_assets')
        .update({ alt_text: altText })
        .eq('id', asset.id)
        .select('*')
        .maybeSingle();
      if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
      return NextResponse.json({
        alt_text: altText,
        asset: updated ? { ...updated, url: resolvePublicUrlForAsset(updated) } : null,
      });
    }

    return NextResponse.json({ alt_text: altText });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'יצירת alt נכשלה';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
