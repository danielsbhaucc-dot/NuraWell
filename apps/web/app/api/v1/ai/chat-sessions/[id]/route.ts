import { NextResponse } from 'next/server';
import { selectChatSessionDetail } from '@/lib/ai/chat-sessions/select-fallbacks';
import { requireApiSession } from '@/lib/api/route-guards';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const { data, error } = await selectChatSessionDetail(auth.supabase, {
    sessionId: id,
    userId: auth.user.id,
  });

  if (error) {
    return NextResponse.json({ error: 'read_failed' }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  return NextResponse.json(data);
}
