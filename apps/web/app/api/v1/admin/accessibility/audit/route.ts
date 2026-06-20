import { NextResponse } from 'next/server';
import type { AccessibilityAuditSummary } from '@/lib/a11y/types';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { consumeMultiRateLimits, rateLimitResponse } from '@/lib/api/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolvePublicUrlForAsset } from '@/lib/cdn/public-media';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const rl = await consumeMultiRateLimits(auth.user.id, 'admin-api', [
    { limit: 60, windowSeconds: 60 },
    { limit: 500, windowSeconds: 3600 },
  ]);
  if (!rl.ok) return rateLimitResponse(rl);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('media_assets')
    .select('id, title, folder, alt_text, kind, object_key, public_url, external_url')
    .eq('kind', 'image')
    .order('updated_at', { ascending: false })
    .limit(500);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data ?? [];
  const missingAlt = rows.filter((row) => row.alt_text == null);
  const emptyAlt = rows.filter((row) => row.alt_text === '');

  const summary: AccessibilityAuditSummary = {
    totalImages: rows.length,
    missingAlt: missingAlt.length,
    emptyAlt: emptyAlt.length,
    samples: [...missingAlt, ...emptyAlt]
      .slice(0, 12)
      .map((row) => ({
        id: row.id,
        title: row.title,
        folder: row.folder,
        url: resolvePublicUrlForAsset(row),
      })),
  };

  return NextResponse.json(summary);
}
