import { NextResponse } from 'next/server';
import { z } from 'zod';
import { closeChatSession } from '@/lib/ai/chat-sessions/close-session';
import { deleteChatSession } from '@/lib/ai/chat-sessions/delete-session';
import { fetchChatSessionTranscript } from '@/lib/ai/chat-sessions/fetch-transcript';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { readJsonBody } from '@/lib/api/json-request';
import { consumeMultiRateLimits, rateLimitResponse } from '@/lib/api/rate-limit';
import {
  createTranscriptAccessRequest,
  fetchAccessRequestById,
  fetchLatestAccessRequestsForSessions,
  getSessionTranscriptAccess,
  logChatTranscriptAdminAudit,
  transcriptAccessAllowsView,
  userHasGlobalTranscriptConsent,
  validateTranscriptAccessReason,
} from '@/lib/admin/chat-transcript-security';
import {
  buildTranscriptJsonExport,
  buildTranscriptTxtExport,
} from '@/lib/admin/chat-transcript-export';
import {
  notifyTranscriptAccessRequest,
  notifyTranscriptSentToUser,
} from '@/lib/admin/chat-transcript-notify';
import {
  buildTranscriptAccessInsight,
  buildTranscriptAccessTimeline,
} from '@/lib/admin/transcript-access-timeline';
import type { AccessRequestRecord } from '@/lib/admin/chat-transcript-security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ userId: string }> };

const sessionIdSchema = z.string().uuid();

const SESSION_LIST_SELECTS = [
  'id, status, title, summary, preview_text, message_count, live_conversation_file, created_at, updated_at, closed_at',
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

function enrichAccessRequestPayload(request: AccessRequestRecord | null | undefined) {
  if (!request) {
    return { access_request: null, access_timeline: [], access_insight: null };
  }
  return {
    access_request: request,
    access_timeline: buildTranscriptAccessTimeline(request),
    access_insight: buildTranscriptAccessInsight(request),
  };
}

async function rateLimitAdmin(userId: string) {
  return consumeMultiRateLimits(userId, 'admin-api', [
    { limit: 120, windowSeconds: 60 },
    { limit: 1000, windowSeconds: 3600 },
  ]);
}

async function rateLimitTranscriptView(adminUserId: string) {
  return consumeMultiRateLimits(adminUserId, 'admin-transcript-view', [
    { limit: 30, windowSeconds: 60 },
    { limit: 200, windowSeconds: 3600 },
  ]);
}

function accessDeniedResponse(access: Awaited<ReturnType<typeof getSessionTranscriptAccess>>) {
  return NextResponse.json(
    {
      error: 'transcript_access_denied',
      access_status: access.status,
      pending_request_id: access.pendingRequestId,
      message: 'נדרש אישור משתמש לצפייה בתמליל',
    },
    { status: 403 },
  );
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

  const url = new URL(request.url);
  const sessionIdRaw = url.searchParams.get('sessionId');

  if (sessionIdRaw) {
    const parsed = sessionIdSchema.safeParse(sessionIdRaw);
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid_session' }, { status: 400 });
    }

    const sessionId = parsed.data;
    const reason = validateTranscriptAccessReason(url.searchParams.get('reason'));
    const format = url.searchParams.get('format');

    const access = await getSessionTranscriptAccess(admin, { userId, sessionId });
    if (!transcriptAccessAllowsView(access)) {
      return accessDeniedResponse(access);
    }

    if (!reason) {
      return NextResponse.json(
        {
          error: 'reason_required',
          message: 'יש להזין סיבת גישה (לפחות 8 תווים) לפני צפייה בתמליל',
          access_status: access.status,
        },
        { status: 400 },
      );
    }

    const viewRl = await rateLimitTranscriptView(auth.user.id);
    if (!viewRl.ok) return rateLimitResponse(viewRl);

    const { data: session, error } = await selectUserChatSession(admin, userId, sessionId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!session) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    const messages = await fetchChatSessionTranscript(admin, {
      sessionId,
      userId,
      limit: 250,
    });

    const auditAction =
      format === 'txt' ? 'export_txt' : format === 'json' ? 'export_json' : 'view_transcript';

    await logChatTranscriptAdminAudit(admin, {
      adminUserId: auth.user.id,
      targetUserId: userId,
      sessionId,
      action: auditAction,
      reason,
      summary: `${auditAction} — ${messages.length} הודעות`,
      payload: { format: format ?? 'inline', access_status: access.status },
    });

    if (format === 'txt') {
      const body = buildTranscriptTxtExport({
        sessionTitle: session.title ?? null,
        sessionId,
        userId,
        turns: messages,
        exportedBy: auth.user.id,
      });
      return new NextResponse(body, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': `attachment; filename="transcript-${sessionId.slice(0, 8)}.txt"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    if (format === 'json') {
      const body = buildTranscriptJsonExport({
        sessionTitle: session.title ?? null,
        sessionId,
        userId,
        turns: messages,
        exportedBy: auth.user.id,
      });
      return new NextResponse(body, {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="transcript-${sessionId.slice(0, 8)}.json"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    return NextResponse.json({
      session,
      messages,
      access_status: access.status,
      access_until: access.sessionAccessUntil,
    });
  }

  const [sessionsRes, periodicRes, profileRes, globalConsent] = await Promise.all([
    selectUserChatSessions(admin, userId),
    admin
      .from('chat_periodic_summaries')
      .select('type, period_key, session_count, ai_insight, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(30),
    admin.from('profiles').select('ai_context, admin_transcript_access_at').eq('id', userId).maybeSingle(),
    userHasGlobalTranscriptConsent(admin, userId),
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

  const sessions = sessionsRes.data ?? [];
  const sessionIds = sessions.map((s: { id: string }) => s.id);
  const requestMap = globalConsent
    ? new Map<string, AccessRequestRecord>()
    : await fetchLatestAccessRequestsForSessions(admin, { userId, sessionIds });

  const sessionsWithAccess = await Promise.all(
    sessions.map(async (s: { id: string }) => {
      if (globalConsent) {
        return {
          ...s,
          transcript_access: 'granted_global' as const,
          ...enrichAccessRequestPayload(null),
        };
      }
      const access = await getSessionTranscriptAccess(admin, { userId, sessionId: s.id });
      const request = requestMap.get(s.id) ?? null;
      return {
        ...s,
        transcript_access: access.status,
        ...enrichAccessRequestPayload(request),
      };
    }),
  );

  return NextResponse.json({
    rollup,
    sessions: sessionsWithAccess,
    periodic_summaries: periodicSummaries,
    transcript_global_consent: globalConsent,
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

const postBodySchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('request_transcript_access'),
      sessionId: z.string().uuid(),
      reason: z.string().min(8).max(500),
    })
    .strict(),
  z
    .object({
      action: z.literal('send_transcript_to_user'),
      sessionId: z.string().uuid(),
      reason: z.string().min(8).max(500),
    })
    .strict(),
]);

export async function POST(request: Request, context: RouteContext) {
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
  const parsed = postBodySchema.safeParse(raw.value);
  if (!parsed.success) {
    return NextResponse.json({ error: 'נתונים לא תקינים' }, { status: 400 });
  }

  const { createAdminClient } = await import('@/lib/supabase/admin');
  const admin = createAdminClient();
  const { sessionId, reason } = parsed.data;

  const { data: session } = await selectUserChatSession(admin, userId, sessionId);
  if (!session) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  if (parsed.data.action === 'request_transcript_access') {
    const result = await createTranscriptAccessRequest(admin, {
      userId,
      sessionId,
      adminUserId: auth.user.id,
      reason,
    });

    if (!result.ok) {
      const status = result.error === 'already_granted' ? 409 : 400;
      return NextResponse.json({ error: result.error }, { status });
    }

    await notifyTranscriptAccessRequest(admin, {
      userId,
      sessionId,
      requestId: result.requestId,
      reason,
    });

    await logChatTranscriptAdminAudit(admin, {
      adminUserId: auth.user.id,
      targetUserId: userId,
      sessionId,
      action: 'request_access',
      reason,
      summary: 'בקשת גישה לתמליל נשלחה למשתמש',
      payload: { request_id: result.requestId },
    });

    const request = await fetchAccessRequestById(admin, result.requestId);
    const enriched = enrichAccessRequestPayload(request);

    return NextResponse.json({
      ok: true,
      request_id: result.requestId,
      status: 'pending',
      message: 'הבקשה נשלחה בהצלחה! התראה נשלחה למשתמש — הסטטוס יתעדכן כאן אוטומטית.',
      ...enriched,
    });
  }

  const access = await getSessionTranscriptAccess(admin, { userId, sessionId });
  if (!transcriptAccessAllowsView(access)) {
    return accessDeniedResponse(access);
  }

  await notifyTranscriptSentToUser(admin, {
    userId,
    sessionId,
    sessionTitle: session.title ?? null,
  });

  await logChatTranscriptAdminAudit(admin, {
    adminUserId: auth.user.id,
    targetUserId: userId,
    sessionId,
    action: 'send_to_user',
    reason,
    summary: 'נשלח קישור לשיחה למשתמש',
  });

  return NextResponse.json({ ok: true });
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

    await logChatTranscriptAdminAudit(admin, {
      adminUserId: auth.user.id,
      targetUserId: userId,
      sessionId: parsed.data.sessionId,
      action: 'view_transcript',
      summary: 'שיחה ותמליל נמחקו על ידי אדמין',
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[admin/chat-memory DELETE]', err);
    return NextResponse.json({ error: 'delete_failed' }, { status: 500 });
  }
}
