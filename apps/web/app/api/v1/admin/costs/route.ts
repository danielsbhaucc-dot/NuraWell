import { NextResponse } from 'next/server';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  buildAggregateCostReport,
  buildUserCostReport,
} from '@/lib/admin/build-cost-report';
import {
  BUNNY_MINUTES_PER_VIEW,
  BUNNY_USD_PER_MINUTE,
} from '@/lib/admin/cost-model';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `GET /api/v1/admin/costs`
 *   • ללא `userId` → דו"ח אגרגטיבי: סך עלות, ממוצע למשתמש, טופ-משתמשים.
 *   • עם `?userId=...` → פירוק עלות מפורט למשתמש בודד.
 * פרמטר `?days=` (ברירת מחדל 30) קובע את חלון הזמן.
 */
export async function GET(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const userId = url.searchParams.get('userId')?.trim() || null;
  const days = Math.min(
    365,
    Math.max(1, Number.parseInt(url.searchParams.get('days') ?? '30', 10) || 30)
  );

  const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const admin = createAdminClient();

  const pricing = {
    bunnyMinutesPerView: BUNNY_MINUTES_PER_VIEW,
    bunnyUsdPerMinute: BUNNY_USD_PER_MINUTE,
  };

  try {
    if (userId) {
      const report = await buildUserCostReport(admin, userId, sinceIso);
      return NextResponse.json({ scope: 'user', userId, days, pricing, ...report });
    }

    const report = await buildAggregateCostReport(admin, sinceIso, days);
    return NextResponse.json({ scope: 'aggregate', days, pricing, ...report });
  } catch (err) {
    console.error('[admin/costs] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'cost report failed' },
      { status: 500 }
    );
  }
}
