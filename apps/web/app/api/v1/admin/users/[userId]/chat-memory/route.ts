import { NextResponse } from 'next/server';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { consumeMultiRateLimits, rateLimitResponse } from '@/lib/api/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ userId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const rl = await consumeMultiRateLimits(auth.user.id, 'admin-api', [
    { limit: 120, windowSeconds: 60 },
    { limit: 1000, windowSeconds: 3600 },
  ]);
  if (!rl.ok) return rateLimitResponse(rl);

  const { userId } = await context.params;
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const admin = createAdminClient();

  const [sessionsRes, periodicRes, profileRes] = await Promise.all([
    admin
      .from('chat_sessions')
      .select(
        'id, status, summary, live_conversation_file, created_at, updated_at, closed_at'
      )
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(50),
    admin
      .from('chat_periodic_summaries')
      .select('type, period_key, session_count, ai_insight, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(30),
    admin.from('profiles').select('ai_context').eq('id', userId).maybeSingle(),
  ]);

  if (sessionsRes.error) {
    return NextResponse.json({ error: sessionsRes.error.message }, { status: 500 });
  }

  const aiContext = (profileRes.data?.ai_context as { chat_summary?: string } | null) ?? {};
  const rollup = typeof aiContext.chat_summary === 'string' ? aiContext.chat_summary : null;

  return NextResponse.json({
    rollup,
    sessions: sessionsRes.data ?? [],
    periodic_summaries: periodicRes.data ?? [],
  });
}
