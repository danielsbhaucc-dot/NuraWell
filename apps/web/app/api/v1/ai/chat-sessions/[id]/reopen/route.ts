import { NextResponse } from 'next/server';
import { requireApiSession } from '@/lib/api/route-guards';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;

  const { data: existing } = await auth.supabase
    .from('chat_sessions')
    .select('session_kind')
    .eq('id', id)
    .eq('user_id', auth.user.id)
    .maybeSingle();

  if (existing?.session_kind === 'profile_update') {
    return NextResponse.json({ error: 'profile_update_read_only' }, { status: 403 });
  }

  const now = new Date().toISOString();

  const { data, error } = await auth.supabase
    .from('chat_sessions')
    .update({
      status: 'open',
      closed_at: null,
      updated_at: now,
    })
    .eq('id', id)
    .eq('user_id', auth.user.id)
    .select('id, status, summary')
    .single();

  if (error) {
    return NextResponse.json({ error: 'reopen_failed' }, { status: 500 });
  }

  return NextResponse.json(data);
}
