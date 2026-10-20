import { NextResponse } from 'next/server';
import { requireApiSession } from '@/lib/api/route-guards';
import { decryptChatContent } from '@/lib/crypto/pii-fields';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

/** Latest Almog reply of the session, if the post-send quality check edited it (client poll). */
export async function GET(request: Request, context: RouteContext) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  const { data } = await auth.supabase
    .from('ai_interactions')
    .select('content, created_at, metadata')
    .eq('session_id', id)
    .eq('user_id', auth.user.id)
    .eq('role', 'assistant')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const meta = (data?.metadata ?? {}) as Record<string, unknown>;
  if (!data || !meta.qc_edited_at) return NextResponse.json({ edited: false });
  return NextResponse.json({
    edited: true,
    created_at: data.created_at,
    content: decryptChatContent(data.content, auth.user.id),
  });
}

export const maxDuration = 10;
