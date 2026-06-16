import { NextResponse } from 'next/server';
import { closeChatSession } from '@/lib/ai/chat-sessions/close-session';
import { requireApiSession } from '@/lib/api/route-guards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;

  try {
    const result = await closeChatSession(auth.supabase, {
      sessionId: id,
      userId: auth.user.id,
    });

    return NextResponse.json({
      session: {
        id: result.session.id,
        status: result.session.status,
        summary: result.session.summary,
      },
      memories_extracted: result.memories_extracted,
      summary: result.summary,
    });
  } catch (err) {
    console.error('[chat-sessions/close]', err);
    return NextResponse.json({ error: 'close_failed' }, { status: 500 });
  }
}
