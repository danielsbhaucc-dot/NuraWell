import { NextResponse } from 'next/server';
import { autoCloseStaleSessionsForUser } from '@/lib/ai/chat-sessions/auto-close-stale-sessions';
import { requireApiSession } from '@/lib/api/route-guards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/ai/chat-sessions/auto-close-stale
 * נקרא בטעינת הצ'אט — סוגר סשנים פתוחים ללא פעילות 12+ שעות.
 */
export async function POST(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;

  try {
    const result = await autoCloseStaleSessionsForUser(auth.supabase, auth.user.id);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('[chat-sessions/auto-close-stale]', err);
    return NextResponse.json({ error: 'auto_close_failed' }, { status: 500 });
  }
}
