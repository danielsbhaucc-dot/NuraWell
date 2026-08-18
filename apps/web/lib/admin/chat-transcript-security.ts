import type { SupabaseClient } from '@supabase/supabase-js';

export type TranscriptAccessStatus = 'granted_global' | 'granted_session' | 'pending' | 'denied' | 'none';

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
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const now = new Date();
  const accessUntil = new Date(now.getTime() + SESSION_ACCESS_HOURS * 60 * 60 * 1000).toISOString();

  const { data: existing, error: fetchErr } = await admin
    .from('chat_transcript_access_requests')
    .select('id, status, expires_at')
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
    })
    .eq('id', params.requestId)
    .eq('user_id', params.userId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export type ChatTranscriptAuditAction =
  | 'view_transcript'
  | 'export_txt'
  | 'export_json'
  | 'copy_transcript'
  | 'send_to_user'
  | 'request_access'
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
