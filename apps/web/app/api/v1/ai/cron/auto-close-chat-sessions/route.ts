import { NextResponse } from 'next/server';
import { autoCloseStaleSessionsBatch } from '@/lib/ai/chat-sessions/auto-close-stale-sessions';
import { authorizeCronRequest } from '@/lib/api/authorize-cron';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/ai/cron/auto-close-chat-sessions
 * סוגר סשנים נטושים (12+ שעות ללא פעילות) ומריץ חילוץ זיכרון.
 */
export async function POST(request: Request) {
  const authError = await authorizeCronRequest(request);
  if (authError) return authError;

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY missing' }, { status: 503 });
  }

  const url = new URL(request.url);
  const limitRaw = url.searchParams.get('limit');
  const limit = limitRaw ? Math.min(200, Math.max(1, Number(limitRaw))) : 40;

  try {
    const result = await autoCloseStaleSessionsBatch(createAdminClient(), { limit });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: 'auto_close_chat_sessions_failed',
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 500 }
    );
  }
}

export function GET() {
  return NextResponse.json({ error: 'POST only' }, { status: 405, headers: { Allow: 'POST' } });
}
