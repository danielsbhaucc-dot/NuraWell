import { NextResponse } from 'next/server';
import { requireApiSession } from '@/lib/api/route-guards';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const { data, error } = await auth.supabase
    .from('chat_sessions')
    .select('id, status, summary')
    .eq('id', id)
    .eq('user_id', auth.user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: 'read_failed' }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  return NextResponse.json(data);
}
