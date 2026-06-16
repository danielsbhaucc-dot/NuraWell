import { NextResponse } from 'next/server';
import { createChatSession } from '@/lib/ai/chat-sessions/ensure-session';
import { requireApiSession } from '@/lib/api/route-guards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
