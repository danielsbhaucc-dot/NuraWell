import { NextResponse } from 'next/server';
import { fetchChatSessionTranscript } from '@/lib/ai/chat-sessions/fetch-transcript';
import { isAwaitingAssistantResponse } from '@/lib/client/chat-awaiting-assistant';
import { requireApiSession } from '@/lib/api/route-guards';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;

  const { data: session, error: sessionErr } = await auth.supabase
    .from('chat_sessions')
    .select('id, status, session_kind, summary')
    .eq('id', id)
    .eq('user_id', auth.user.id)
    .maybeSingle();

  if (sessionErr) {
    return NextResponse.json({ error: 'read_failed' }, { status: 500 });
  }
  if (!session) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const sessionKind = (session.session_kind as string | null) ?? 'chat';

  if (sessionKind === 'profile_update') {
    return NextResponse.json({
      session: {
        id: session.id,
        status: session.status,
        session_kind: 'profile_update',
        summary: session.summary,
      },
      messages: [],
      read_only: true,
      awaiting_assistant: false,
    });
  }

  try {
    const turns = await fetchChatSessionTranscript(auth.supabase, {
      sessionId: id,
      userId: auth.user.id,
    });
    return NextResponse.json({
      session: {
        id: session.id,
        status: session.status,
        session_kind: 'chat',
        summary: session.summary,
      },
      messages: turns,
      awaiting_assistant: isAwaitingAssistantResponse(turns),
    });
  } catch (err) {
    console.error('[chat-sessions/messages]', err);
    return NextResponse.json({ error: 'messages_failed' }, { status: 500 });
  }
}
