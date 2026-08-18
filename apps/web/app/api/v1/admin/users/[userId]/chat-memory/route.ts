import { NextResponse } from 'next/server';
import { z } from 'zod';
import { closeChatSession } from '@/lib/ai/chat-sessions/close-session';
import { deleteChatSession } from '@/lib/ai/chat-sessions/delete-session';
import { fetchChatSessionTranscript } from '@/lib/ai/chat-sessions/fetch-transcript';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { readJsonBody } from '@/lib/api/json-request';
import { consumeMultiRateLimits, rateLimitResponse } from '@/lib/api/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ userId: string }> };

const sessionIdSchema = z.string().uuid();

const SESSION_LIST_SELECTS = [
  'id, status, title, summary, live_conversation_file, created_at, updated_at, closed_at',
  'id, status, summary, live_conversation_file, created_at, updated_at, closed_at',
  'id, status, summary, created_at, updated_at, closed_at',
] as const;

function isMissingColumnError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === '42703' || error.code === 'PGRST204' || /column .* does not exist/i.test(error.message ?? '');
}

function isMissingRelationError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === '42P01' || error.code === 'PGRST205' || /relation .* does not exist/i.test(error.message ?? '');
}

async function selectUserChatSessions(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: { from: (table: string) => any },
  userId: string
) {
  let lastError: { code?: string; message?: string } | null = null;
  for (const select of SESSION_LIST_SELECTS) {
    const { data, error } = await admin
      .from('chat_sessions')
      .select(select)
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(50);
    if (!error) return { data: data ?? [], error: null };
    lastError = error;
    if (!isMissingColumnError(error)) break;
  }
  return { data: null, error: lastError };
}

async function selectUserChatSession(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: { from: (table: string) => any },
  userId: string,
  sessionId: string
) {
  let lastError: { code?: string; message?: string } | null = null;
  for (const select of SESSION_LIST_SELECTS) {
    const { data, error } = await admin
      .from('chat_sessions')
      .select(select)
      .eq('id', sessionId)
      .eq('user_id', userId)
      .maybeSingle();
    if (!error) return { data, error: null };
    lastError = error;
    if (!isMissingColumnError(error)) break;
  }
  return { data: null, error: lastError };
}

async function rateLimitAdmin(userId: string) {
  return consumeMultiRateLimits(userId, 'admin-api', [
    { limit: 120, windowSeconds: 60 },
    { limit: 1000, windowSeconds: 3600 },
  ]);
}

export async function GET(request: Request, context: RouteContext) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const rl = await rateLimitAdmin(auth.user.id);
  if (!rl.ok) return rateLimitResponse(rl);

  const { userId } = await context.params;
  if (!sessionIdSchema.safeParse(userId).success) {
    return NextResponse.json({ error: 'invalid_user' }, { status: 400 });
  }

  const { createAdminClient } = await import('@/lib/supabase/admin');
  const admin = createAdminClient();

  const sessionIdRaw = new URL(request.url).searchParams.get('sessionId');
  if (sessionIdRaw) {
    const parsed = sessionIdSchema.safeParse(sessionIdRaw);
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid_session' }, { status: 400 });
    }

    const { data: session, error } = await selectUserChatSession(admin, userId, parsed.data);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!session) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    const messages = await fetchChatSessionTranscript(admin, {
      sessionId: parsed.data,
      userId,
      limit: 250,
    });

    return NextResponse.json({ session, messages });
  }

  const [sessionsRes, periodicRes, profileRes] = await Promise.all([
    selectUserChatSessions(admin, userId),
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

  const periodicSummaries =
    periodicRes.error && !isMissingRelationError(periodicRes.error) && !isMissingColumnError(periodicRes.error)
      ? null
      : (periodicRes.data ?? []);

  if (periodicSummaries === null) {
    return NextResponse.json({ error: periodicRes.error?.message ?? 'periodic_fetch_failed' }, { status: 500 });
  }

  const aiContext = (profileRes.data?.ai_context as { chat_summary?: string } | null) ?? {};
  const rollup = typeof aiContext.chat_summary === 'string' ? aiContext.chat_summary : null;

  return NextResponse.json({
    rollup,
    sessions: sessionsRes.data ?? [],
    periodic_summaries: periodicSummaries,
  });
}

const patchBodySchema = z
  .object({
    sessionId: z.string().uuid(),
    action: z.enum(['close', 'reopen']),
  })
  .strict();

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const rl = await rateLimitAdmin(auth.user.id);
  if (!rl.ok) return rateLimitResponse(rl);

  const { userId } = await context.params;
  if (!sessionIdSchema.safeParse(userId).success) {
    return NextResponse.json({ error: 'invalid_user' }, { status: 400 });
  }

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;
  const parsed = patchBodySchema.safeParse(raw.value);
  if (!parsed.success) {
    return NextResponse.json({ error: 'נתונים לא תקינים' }, { status: 400 });
  }

  const { createAdminClient } = await import('@/lib/supabase/admin');
  const admin = createAdminClient();
  const { sessionId, action } = parsed.data;

  const { data: existing } = await admin
    .from('chat_sessions')
    .select('id, session_kind')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  if (existing.session_kind === 'profile_update') {
    return NextResponse.json({ error: 'profile_update_read_only' }, { status: 403 });
  }

  try {
    if (action === 'close') {
      const result = await closeChatSession(admin, { sessionId, userId });
      return NextResponse.json({
        session: {
          id: result.session.id,
          status: result.session.status,
          title: result.session.title,
          summary: result.session.summary,
        },
      });
    }

    const now = new Date().toISOString();
    let reopened = await admin
      .from('chat_sessions')
      .update({ status: 'open', closed_at: null, updated_at: now })
      .eq('id', sessionId)
      .eq('user_id', userId)
      .select('id, status, title, summary')
      .single();
    if (reopened.error && isMissingColumnError(reopened.error)) {
      reopened = await admin
        .from('chat_sessions')
        .update({ status: 'open', closed_at: null, updated_at: now })
        .eq('id', sessionId)
        .eq('user_id', userId)
        .select('id, status, summary')
        .single();
    }
    if (reopened.error) throw reopened.error;
    return NextResponse.json({ session: reopened.data });
  } catch (err) {
    console.error('[admin/chat-memory PATCH]', err);
    return NextResponse.json({ error: 'action_failed' }, { status: 500 });
  }
}

const deleteBodySchema = z.object({ sessionId: z.string().uuid() }).strict();

export async function DELETE(request: Request, context: RouteContext) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const rl = await rateLimitAdmin(auth.user.id);
  if (!rl.ok) return rateLimitResponse(rl);

  const { userId } = await context.params;
  if (!sessionIdSchema.safeParse(userId).success) {
    return NextResponse.json({ error: 'invalid_user' }, { status: 400 });
  }

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;
  const parsed = deleteBodySchema.safeParse(raw.value);
  if (!parsed.success) {
    return NextResponse.json({ error: 'נתונים לא תקינים' }, { status: 400 });
  }

  const { createAdminClient } = await import('@/lib/supabase/admin');
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from('chat_sessions')
    .select('id')
    .eq('id', parsed.data.sessionId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  try {
    await deleteChatSession(admin, { sessionId: parsed.data.sessionId, userId });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[admin/chat-memory DELETE]', err);
    return NextResponse.json({ error: 'delete_failed' }, { status: 500 });
  }
}
