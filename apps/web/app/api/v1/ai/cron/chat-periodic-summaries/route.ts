import { NextResponse } from 'next/server';
import {
  runAllDueChatSummaryTiers,
  runChatPeriodicSummariesBatch,
  type ChatSummaryTier,
} from '@/lib/ai/chat-memory/chat-periodic-summaries';
import { CHAT_SUMMARY_TYPES } from '@/lib/ai/chat-memory/chat-period-keys';
import { authorizeCronRequest } from '@/lib/api/authorize-cron';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/ai/cron/chat-periodic-summaries
 * ?tier=daily|weekly|monthly|bi_monthly|quarterly|semi_annual|annual|all
 * ?dateKey=YYYY-MM-DD (יומי, ישראל) &force=1 (דילוג על לוח זמנים)
 */
export async function POST(request: Request) {
  const authError = await authorizeCronRequest(request);
  if (authError) return authError;

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY missing' }, { status: 503 });
  }

  const admin = createAdminClient();

  const url = new URL(request.url);
  const limitRaw = url.searchParams.get('limit');
  const limit = limitRaw ? Math.min(100, Math.max(1, Number(limitRaw))) : 40;
  const tierParam = url.searchParams.get('tier')?.trim() ?? 'daily';
  const dateKey = url.searchParams.get('dateKey')?.trim() || undefined;
  const force = url.searchParams.get('force') === '1';

  try {
    if (tierParam === 'all') {
      const results = await runAllDueChatSummaryTiers(admin, { limit });
      return NextResponse.json({ ok: true, results });
    }

    const tier = tierParam as ChatSummaryTier;
    if (!CHAT_SUMMARY_TYPES.includes(tier)) {
      return NextResponse.json({ error: 'invalid_tier', allowed: CHAT_SUMMARY_TYPES }, { status: 400 });
    }

    const result = await runChatPeriodicSummariesBatch(admin, {
      limit,
      tier,
      dateKey,
      force,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: 'chat_periodic_summaries_failed',
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 500 }
    );
  }
}

export function GET() {
  return NextResponse.json({ error: 'POST only' }, { status: 405, headers: { Allow: 'POST' } });
}
