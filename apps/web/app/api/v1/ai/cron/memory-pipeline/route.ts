import { NextResponse } from 'next/server';
import { authorizeCronRequest } from '@/lib/api/authorize-cron';
import { createAdminClient } from '@/lib/supabase/admin';
import { autoCloseStaleSessionsBatch } from '@/lib/ai/chat-sessions/auto-close-stale-sessions';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/ai/cron/memory-pipeline — one QStash schedule (hourly) for the whole memory chain:
 *  every hour: close idle sessions (CHAT_SESSION_STALE_HOURS, default 2h) → dated key points + memory facts.
 *  at 03:00 IL (or ?full=1): consolidate pending logs into memory facts, then roll up due tiers
 *  (daily → weekly → monthly → … → annual), then the behaviour-pattern insights batch.
 *  Each step is independent; one failing doesn't stop the rest.
 *  Also kicked once a day by the master cron (QStash publish, ?full=1) so the chain runs even if
 *  the hourly schedule is missing.
 */
export async function POST(request: Request) {
  const authError = await authorizeCronRequest(request);
  if (authError) return authError;
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY missing' }, { status: 503 });
  }
  const admin = createAdminClient();
  const url = new URL(request.url);
  const hourIl = Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', hour12: false }).format(new Date())
  );
  const full = url.searchParams.get('full') === '1' || hourIl === 3;
  const out: Record<string, unknown> = { full };
  const step = async (name: string, fn: () => Promise<unknown>) => {
    try {
      out[name] = await fn();
    } catch (e) {
      out[name] = { error: e instanceof Error ? e.message : String(e) };
    }
  };
  await step('auto_close', () => autoCloseStaleSessionsBatch(admin, { limit: 100 }));
  if (full) {
    // perf: full-only modules load lazily so the 23 hourly non-full runs skip parsing them
    await step('consolidation', async () =>
      (await import('@/lib/ai/memory-consolidation/run-batch')).runMemoryConsolidationBatch(admin, {})
    );
    await step('tiers', async () =>
      (await import('@/lib/ai/chat-memory/chat-periodic-summaries')).runAllDueChatSummaryTiers(admin, { limit: 60 })
    );
    await step('patterns', async () =>
      (await import('@/lib/ai/insights/patterns/run-pattern-batch')).runPatternInsightsBatch(admin, { budgetMs: 120_000 })
    );
  }
  return NextResponse.json({ ok: true, ...out });
}

export function GET() {
  return NextResponse.json({ error: 'POST only' }, { status: 405, headers: { Allow: 'POST' } });
}
