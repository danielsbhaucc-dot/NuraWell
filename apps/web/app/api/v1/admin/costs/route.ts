import { NextResponse } from 'next/server';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { consumeMultiRateLimits, rateLimitResponse } from '@/lib/api/rate-limit';
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
/** Fixed platform costs (USD/month) at current plans — not per user. Update when a plan changes. */
const FIXED_MONTHLY_USD = [
  { item: 'Supabase', plan: 'Free', usd: Number(process.env.COST_SUPABASE_USD ?? 0) },
  { item: 'Vercel', plan: 'Hobby', usd: Number(process.env.COST_VERCEL_USD ?? 0) },
  { item: 'Upstash QStash/Vector', plan: 'Free', usd: Number(process.env.COST_UPSTASH_USD ?? 0) },
  { item: 'Bunny storage', plan: 'pay-as-you-go', usd: 0.004 },
  { item: 'Telegram', plan: 'Bot API', usd: 0 },
];

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

  const rl = await consumeMultiRateLimits(auth.user.id, 'admin-api', [
    { limit: 120, windowSeconds: 60 },
    { limit: 1000, windowSeconds: 3600 },
  ]);
  if (!rl.ok) return rateLimitResponse(rl);

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

    // Ops home only needs two numbers: skip the daily trend, send a tiny payload, let the browser reuse it for 5 min.
    if (url.searchParams.get('summary') === '1') {
      const report = await buildAggregateCostReport(admin, sinceIso, days);
      return NextResponse.json(
        { days, averagePerActiveUser: { totalUsd: report.averagePerActiveUser?.totalUsd ?? 0 }, activeUsers: report.activeUsers ?? 0 },
        { headers: { 'Cache-Control': 'private, max-age=300' } },
      );
    }

    const [report, trendRes] = await Promise.all([buildAggregateCostReport(admin, sinceIso, days), admin.rpc('cost_daily', { p_days: days })]);
    const byDay = new Map<string, { day: string; usd: number; active: number }>();
    for (const r of (trendRes.data ?? []) as { day: string; cost_usd: number; active_users: number }[]) {
      const d = byDay.get(r.day) ?? { day: r.day, usd: 0, active: r.active_users };
      d.usd += Number(r.cost_usd) || 0;
      byDay.set(r.day, d);
    }
    const trend = [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
    return NextResponse.json({ scope: 'aggregate', days, pricing, fixedMonthly: FIXED_MONTHLY_USD, trend, ...report });
  } catch (err) {
    console.error('[admin/costs] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'cost report failed' },
      { status: 500 }
    );
  }
}

// Cap function time so a hung upstream call cannot burn active CPU for the 300s default.
export const maxDuration = 30;
