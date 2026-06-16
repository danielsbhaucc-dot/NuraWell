import { NextResponse } from 'next/server';

import { authorizeCronRequest } from '../../../../../../lib/api/authorize-cron';
import { runMemoryConsolidationBatch } from '../../../../../../lib/ai/memory-consolidation/run-batch';
import { createAdminClient } from '../../../../../../lib/supabase/admin';

/**
 * POST /api/v1/ai/cron/memory-consolidation
 *
 * Autonomous Memory Manager — עיבוד אצווה יומי:
 * pending_chat_logs → LLM (OpenRouter) → ADD/UPDATE/DEPRECATE/VERIFY → user_insights
 *
 * Standalone route — העדיפות: master cron ב-06:00 (POST /api/v1/ai/cron/master).
 * נשאר לבדיקות ידניות / dryRun.
 */
export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const authError = await authorizeCronRequest(request);
  if (authError) return authError;

  const url = new URL(request.url);
  const dryRunRaw = url.searchParams.get('dryRun') ?? url.searchParams.get('dry_run');
  const isDryRun = dryRunRaw === '1' || dryRunRaw === 'true';

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    return NextResponse.json(
      { error: 'SUPABASE_SERVICE_ROLE_KEY missing' },
      { status: 503 }
    );
  }

  try {
    const result = await runMemoryConsolidationBatch(createAdminClient(), {
      dryRun: isDryRun,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Memory consolidation failed',
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 500 }
    );
  }
}

export function GET() {
  return NextResponse.json({ error: 'POST only' }, { status: 405, headers: { Allow: 'POST' } });
}
