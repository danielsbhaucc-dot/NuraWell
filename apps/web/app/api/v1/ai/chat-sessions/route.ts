import { NextResponse } from 'next/server';
import { createChatSession } from '@/lib/ai/chat-sessions/ensure-session';
import { listChatSessionsForUser } from '@/lib/ai/chat-sessions/list-sessions';
import { requireApiSession } from '@/lib/api/route-guards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** רשימת שיחות — Intercom-style inbox */
export async function GET(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;

  try {
    const sessions = await listChatSessionsForUser(auth.supabase, auth.user.id);
    return NextResponse.json({ sessions });
  } catch (err) {
    console.error('[chat-sessions GET]', err);
    return NextResponse.json({ error: 'list_failed' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;

  const session = await createChatSession(auth.supabase, auth.user.id);
  return NextResponse.json({
    id: session.id,
    status: session.status,
    summary: session.summary,
  });
}
