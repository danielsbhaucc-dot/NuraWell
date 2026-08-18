import type { SupabaseClient } from '@supabase/supabase-js';

export type TranscriptAccessStatus = 'granted_global' | 'granted_session' | 'pending' | 'denied' | 'none' | 'cancelled';

export type TranscriptAccessInfo = {
  status: TranscriptAccessStatus;
  globalConsent: boolean;
  pendingRequestId: string | null;
  sessionAccessUntil: string | null;
};

const SESSION_ACCESS_HOURS = 24;

export async function userHasGlobalTranscriptConsent(
  admin: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data: profile } = await admin
    .from('profiles')
    .select('admin_transcript_access_at')
    .eq('id', userId)
    .maybeSingle();

  if (profile?.admin_transcript_access_at) return true;

  const { data: consent } = await admin
    .from('user_consents')
    .select('granted')
    .eq('user_id', userId)
    .eq('consent_type', 'admin_transcript_access')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return consent?.granted === true;
}

export async function getSessionTranscriptAccess(
  admin: SupabaseClient,
  params: { userId: string; sessionId: string },
): Promise<TranscriptAccessInfo> {
  const globalConsent = await userHasGlobalTranscriptConsent(admin, params.userId);
  if (globalConsent) {
    return {
      status: 'granted_global',
      globalConsent: true,
      pendingRequestId: null,
      sessionAccessUntil: null,
    };
  }

  const now = new Date().toISOString();

  const { data: approved } = await admin
    .from('chat_transcript_access_requests')
    .select('id, access_until, resolved_at')
    .eq('user_id', params.userId)
    .eq('session_id', params.sessionId)
    .eq('status', 'approved')
    .order('resolved_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (approved) {
    const until = approved.access_until ?? approved.resolved_at;
    if (until && new Date(until).getTime() > Date.now()) {
      return {
        status: 'granted_session',
        globalConsent: false,
        pendingRequestId: null,
        sessionAccessUntil: until,
      };
    }
  }

  const { data: pending } = await admin
    .from('chat_transcript_access_requests')
    .select('id')
    .eq('user_id', params.userId)
    .eq('session_id', params.sessionId)
    .eq('status', 'pending')
    .gt('expires_at', now)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (pending) {
    return {
      status: 'pending',
      globalConsent: false,
      pendingRequestId: pending.id,
      sessionAccessUntil: null,
    };
  }

  const { data: denied } = await admin
    .from('chat_transcript_access_requests')
    .select('id')
    .eq('user_id', params.userId)
    .eq('session_id', params.sessionId)
    .eq('status', 'denied')
    .order('resolved_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (denied) {
    return {
      status: 'denied',
      globalConsent: false,
      pendingRequestId: null,
      sessionAccessUntil: null,
    };
  }

  const { data: cancelled } = await admin
    .from('chat_transcript_access_requests')
    .select('id')
    .eq('user_id', params.userId)
    .eq('session_id', params.sessionId)
    .eq('status', 'cancelled')
    .order('resolved_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cancelled) {
    return {
      status: 'none',
      globalConsent: false,
      pendingRequestId: null,
      sessionAccessUntil: null,
    };
  }

  return {
    status: 'none',
    globalConsent: false,
    pendingRequestId: null,
    sessionAccessUntil: null,
  };
}

export function transcriptAccessAllowsView(info: TranscriptAccessInfo): boolean {
  return info.status === 'granted_global' || info.status === 'granted_session';
}

export async function createTranscriptAccessRequest(
  admin: SupabaseClient,
  params: {
    userId: string;
    sessionId: string;
    adminUserId: string;
    reason: string;
  },
): Promise<{ ok: true; requestId: string } | { ok: false; error: string }> {
  const reason = params.reason.trim();
  if (reason.length < 8) {
    return { ok: false, error: 'reason_too_short' };
  }

  const access = await getSessionTranscriptAccess(admin, {
    userId: params.userId,
    sessionId: params.sessionId,
  });
  if (transcriptAccessAllowsView(access)) {
    return { ok: false, error: 'already_granted' };
  }
  if (access.status === 'pending') {
    return { ok: false, error: 'already_pending' };
  }

  const { data, error } = await admin
    .from('chat_transcript_access_requests')
    .insert({
      user_id: params.userId,
      session_id: params.sessionId,
      admin_user_id: params.adminUserId,
      reason,
      status: 'pending',
    })
    .select('id')
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, requestId: data.id as string };
}

export async function resolveTranscriptAccessRequest(
  admin: SupabaseClient,
  params: {
    requestId: string;
    userId: string;
    approve: boolean;
    userResponseNote?: string | null;
  },
): Promise<
  | { ok: true; adminUserId: string; sessionId: string; requestId: string }
  | { ok: false; error: string }
> {
  const now = new Date();
  const accessUntil = new Date(now.getTime() + SESSION_ACCESS_HOURS * 60 * 60 * 1000).toISOString();
  const userNote = params.userResponseNote?.trim() || null;

  const { data: existing, error: fetchErr } = await admin
    .from('chat_transcript_access_requests')
    .select('id, status, expires_at, admin_user_id, session_id')
    .eq('id', params.requestId)
    .eq('user_id', params.userId)
    .maybeSingle();

  if (fetchErr) return { ok: false, error: fetchErr.message };
  if (!existing) return { ok: false, error: 'not_found' };
  if (existing.status !== 'pending') return { ok: false, error: 'not_pending' };
  if (new Date(existing.expires_at as string).getTime() < Date.now()) {
    await admin
      .from('chat_transcript_access_requests')
      .update({ status: 'expired', resolved_at: now.toISOString() })
      .eq('id', params.requestId);
    return { ok: false, error: 'expired' };
  }

  const { error } = await admin
    .from('chat_transcript_access_requests')
    .update({
      status: params.approve ? 'approved' : 'denied',
      resolved_at: now.toISOString(),
      access_until: params.approve ? accessUntil : null,
      user_response_note: params.approve ? null : userNote,
    })
    .eq('id', params.requestId)
    .eq('user_id', params.userId);

  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    adminUserId: existing.admin_user_id as string,
    sessionId: existing.session_id as string,
    requestId: params.requestId,
  };
}

export type ChatTranscriptAuditAction =
  | 'view_transcript'
  | 'export_txt'
  | 'export_json'
  | 'copy_transcript'
  | 'send_to_user'
  | 'request_access'
  | 'cancel_access_request'
  | 'share_summary';

export async function logChatTranscriptAdminAudit(
  admin: SupabaseClient,
  entry: {
    adminUserId: string;
    targetUserId: string;
    sessionId?: string | null;
    action: ChatTranscriptAuditAction;
    reason?: string | null;
    summary: string;
    payload?: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await admin.from('chat_transcript_admin_audit_log').insert({
    admin_user_id: entry.adminUserId,
    target_user_id: entry.targetUserId,
    session_id: entry.sessionId ?? null,
    action: entry.action,
    reason: entry.reason?.trim() || null,
    summary: entry.summary,
    payload: entry.payload ?? {},
  });

  if (error) {
    console.warn('[chat-transcript-audit] insert failed', error.message);
  }
}

export function validateTranscriptAccessReason(reason: string | null | undefined): string | null {
  const t = (reason ?? '').trim();
  if (t.length < 8) return null;
  if (t.length > 500) return t.slice(0, 500);
  return t;
}

const ACCESS_REQUEST_SELECTS = [
  'id, session_id, status, reason, created_at, expires_at, resolved_at, access_until, notification_sent_at, user_viewed_at, user_response_note, notification_id, cancelled_at',
  'id, session_id, status, reason, created_at, expires_at, resolved_at, access_until, notification_sent_at, user_viewed_at, user_response_note',
  'id, session_id, status, reason, created_at, expires_at, resolved_at, access_until, user_response_note',
  'id, session_id, status, reason, created_at, expires_at, resolved_at, access_until',
] as const;

export type AccessRequestRecord = {
  id: string;
  session_id: string | null;
  status: 'pending' | 'approved' | 'denied' | 'expired' | 'cancelled';
  reason: string;
  created_at: string;
  expires_at: string;
  resolved_at: string | null;
  access_until: string | null;
  notification_sent_at: string | null;
  user_viewed_at: string | null;
  user_response_note: string | null;
  notification_id?: string | null;
  cancelled_at?: string | null;
};

function isMissingColumnError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === '42703' || error.code === 'PGRST204' || /column .* does not exist/i.test(error.message ?? '');
}

export async function fetchAccessRequestById(
  admin: SupabaseClient,
  requestId: string,
): Promise<AccessRequestRecord | null> {
  for (const select of ACCESS_REQUEST_SELECTS) {
    const { data, error } = await admin
      .from('chat_transcript_access_requests')
      .select(select)
      .eq('id', requestId)
      .maybeSingle();
    if (!error) return (data as unknown as AccessRequestRecord | null) ?? null;
    if (!isMissingColumnError(error)) break;
  }
  return null;
}

export async function fetchLatestAccessRequestsForSessions(
  admin: SupabaseClient,
  params: { userId: string; sessionIds: string[] },
): Promise<Map<string, AccessRequestRecord>> {
  const map = new Map<string, AccessRequestRecord>();
  if (params.sessionIds.length === 0) return map;

  for (const select of ACCESS_REQUEST_SELECTS) {
    const { data, error } = await admin
      .from('chat_transcript_access_requests')
      .select(select)
      .eq('user_id', params.userId)
      .in('session_id', params.sessionIds)
      .order('created_at', { ascending: false });

    if (!error) {
      for (const row of (data ?? []) as unknown as AccessRequestRecord[]) {
        if (!row.session_id || map.has(row.session_id)) continue;
        map.set(row.session_id, row);
      }
      return map;
    }
    if (!isMissingColumnError(error)) break;
  }
  return map;
}

export async function markTranscriptRequestViewed(
  admin: SupabaseClient,
  params: { requestId: string; userId: string },
): Promise<void> {
  const now = new Date().toISOString();
  let updated = await admin
    .from('chat_transcript_access_requests')
    .update({ user_viewed_at: now })
    .eq('id', params.requestId)
    .eq('user_id', params.userId)
    .is('user_viewed_at', null);

  if (updated.error && isMissingColumnError(updated.error)) {
    return;
  }
}

export async function markTranscriptRequestNotificationSent(
  admin: SupabaseClient,
  requestId: string,
  notificationId?: string | null,
): Promise<void> {
  const now = new Date().toISOString();
  const patch: Record<string, string> = { notification_sent_at: now };
  if (notificationId) patch.notification_id = notificationId;

  const { error } = await admin
    .from('chat_transcript_access_requests')
    .update(patch)
    .eq('id', requestId);

  if (error && !isMissingColumnError(error)) {
    console.warn('[transcript-access] notification_sent_at update failed', error.message);
  }
}

export async function cancelTranscriptAccessRequest(
  admin: SupabaseClient,
  params: {
    userId: string;
    sessionId: string;
    adminUserId: string;
  },
): Promise<
  | { ok: true; requestId: string; notificationId: string | null }
  | { ok: false; error: string }
> {
  const { data: pending, error: fetchErr } = await admin
    .from('chat_transcript_access_requests')
    .select('id, status, notification_id')
    .eq('user_id', params.userId)
    .eq('session_id', params.sessionId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fetchErr) return { ok: false, error: fetchErr.message };
  if (!pending) return { ok: false, error: 'no_pending_request' };

  const now = new Date().toISOString();
  const { error } = await admin
    .from('chat_transcript_access_requests')
    .update({
      status: 'cancelled',
      resolved_at: now,
      cancelled_at: now,
      cancelled_by_admin_id: params.adminUserId,
    })
    .eq('id', pending.id)
    .eq('user_id', params.userId);

  if (error) return { ok: false, error: error.message };

  const notificationId = (pending.notification_id as string | null) ?? null;
  if (notificationId) {
    const { revokeTranscriptAccessNotification } = await import('./chat-transcript-notify');
    await revokeTranscriptAccessNotification(admin, {
      notificationId,
      userId: params.userId,
    });
  }

  return {
    ok: true,
    requestId: pending.id as string,
    notificationId,
  };
}
