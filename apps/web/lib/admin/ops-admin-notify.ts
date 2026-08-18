import type { SupabaseClient } from '@supabase/supabase-js';
import {
  genderApproved,
  genderDenied,
  genderGrantedGlobal,
  genderRevoked,
  type ProfileGender,
} from '@/lib/privacy/gender-hebrew';

export type OpsAdminNotificationType =
  | 'transcript_access_approved'
  | 'transcript_access_denied'
  | 'transcript_consent_granted'
  | 'transcript_consent_revoked'
  | 'transcript_access_expired';

export type OpsAdminNotificationParams = {
  adminUserId: string;
  type: OpsAdminNotificationType;
  title: string;
  body: string;
  iconEmoji?: string;
  actionUrl?: string | null;
  metadata?: Record<string, unknown>;
};

export async function sendOpsAdminNotification(
  admin: SupabaseClient,
  params: OpsAdminNotificationParams,
): Promise<void> {
  const { error } = await admin.from('ops_admin_notifications').insert({
    admin_user_id: params.adminUserId,
    type: params.type,
    title: params.title,
    body: params.body,
    icon_emoji: params.iconEmoji ?? '🔔',
    action_url: params.actionUrl ?? null,
    is_read: false,
    metadata: params.metadata ?? {},
  });

  if (error) {
    console.warn('[ops-admin-notify] insert failed', error.message);
  }
}

export async function notifyAdminTranscriptAccessApproved(
  admin: SupabaseClient,
  params: {
    adminUserId: string;
    userId: string;
    userDisplayName: string;
    sessionId: string;
    requestId: string;
    userGender?: ProfileGender;
  },
): Promise<void> {
  const gender = params.userGender ?? (await resolveUserProfile(admin, params.userId)).gender;
  const approved = genderApproved(gender);
  await sendOpsAdminNotification(admin, {
    adminUserId: params.adminUserId,
    type: 'transcript_access_approved',
    title: 'אושרה גישה לתמליל',
    body: `${params.userDisplayName} ${approved} את בקשתך לצפייה בתמליל. הגישה תקפה ל-24 שעות.`,
    iconEmoji: '✅',
    actionUrl: `/ops/users?user=${params.userId}&tab=conversations&session=${params.sessionId}`,
    metadata: {
      user_id: params.userId,
      session_id: params.sessionId,
      request_id: params.requestId,
    },
  });
}

export async function notifyAdminTranscriptAccessDenied(
  admin: SupabaseClient,
  params: {
    adminUserId: string;
    userId: string;
    userDisplayName: string;
    sessionId: string;
    requestId: string;
    userNote?: string | null;
    userGender?: ProfileGender;
  },
): Promise<void> {
  const gender = params.userGender ?? (await resolveUserProfile(admin, params.userId)).gender;
  const denied = genderDenied(gender);
  const noteSuffix = params.userNote?.trim()
    ? `\nהערת המשתמש: ${params.userNote.trim()}`
    : '';
  await sendOpsAdminNotification(admin, {
    adminUserId: params.adminUserId,
    type: 'transcript_access_denied',
    title: 'נדחתה בקשת גישה לתמליל',
    body: `${params.userDisplayName} ${denied} את הבקשה.${noteSuffix}`,
    iconEmoji: '🚫',
    actionUrl: `/ops/users?user=${params.userId}&tab=conversations`,
    metadata: {
      user_id: params.userId,
      session_id: params.sessionId,
      request_id: params.requestId,
      user_note: params.userNote?.trim() || null,
    },
  });
}

export async function notifyAdminTranscriptConsentGranted(
  admin: SupabaseClient,
  params: {
    adminUserId: string;
    userId: string;
    userDisplayName: string;
    userGender?: ProfileGender;
  },
): Promise<void> {
  const gender = params.userGender ?? (await resolveUserProfile(admin, params.userId)).gender;
  await sendOpsAdminNotification(admin, {
    adminUserId: params.adminUserId,
    type: 'transcript_consent_granted',
    title: 'הסכמה גלובלית לתמלילים',
    body: `${params.userDisplayName} ${genderGrantedGlobal(gender)}.`,
    iconEmoji: '🔓',
    actionUrl: `/ops/users?user=${params.userId}&tab=conversations`,
    metadata: { user_id: params.userId },
  });
}

export async function notifyAdminTranscriptConsentRevoked(
  admin: SupabaseClient,
  params: {
    adminUserId: string;
    userId: string;
    userDisplayName: string;
    userGender?: ProfileGender;
  },
): Promise<void> {
  const gender = params.userGender ?? (await resolveUserProfile(admin, params.userId)).gender;
  const revoked = genderRevoked(gender);
  await sendOpsAdminNotification(admin, {
    adminUserId: params.adminUserId,
    type: 'transcript_consent_revoked',
    title: 'בוטלה הסכמה לתמלילים',
    body: `${params.userDisplayName} ${revoked} את ההסכמה הגלובלית לגישת צוות לתמלילים.`,
    iconEmoji: '🔒',
    actionUrl: `/ops/users?user=${params.userId}&tab=conversations`,
    metadata: { user_id: params.userId },
  });
}

export async function notifyAllAdminsTranscriptConsentChange(
  admin: SupabaseClient,
  params: {
    userId: string;
    userDisplayName: string;
    granted: boolean;
    excludeAdminId?: string | null;
  },
): Promise<void> {
  const { data: admins } = await admin
    .from('profiles')
    .select('id')
    .eq('role', 'admin');

  for (const row of admins ?? []) {
    if (params.excludeAdminId && row.id === params.excludeAdminId) continue;
    if (params.granted) {
      await notifyAdminTranscriptConsentGranted(admin, {
        adminUserId: row.id as string,
        userId: params.userId,
        userDisplayName: params.userDisplayName,
      });
    } else {
      await notifyAdminTranscriptConsentRevoked(admin, {
        adminUserId: row.id as string,
        userId: params.userId,
        userDisplayName: params.userDisplayName,
      });
    }
  }
}

async function resolveUserProfile(
  admin: SupabaseClient,
  userId: string,
): Promise<{ displayName: string; gender: ProfileGender }> {
  const { data } = await admin
    .from('profiles')
    .select('full_name, gender')
    .eq('id', userId)
    .maybeSingle();

  const full = (data?.full_name as string | null)?.trim();
  return {
    displayName: full || 'משתמש',
    gender: (data?.gender as ProfileGender) ?? null,
  };
}

async function resolveUserDisplayName(
  admin: SupabaseClient,
  userId: string,
): Promise<string> {
  const profile = await resolveUserProfile(admin, userId);
  return profile.displayName;
}

export { resolveUserDisplayName };

export type OpsAdminNotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string;
  icon_emoji: string;
  action_url: string | null;
  is_read: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
};

export async function getOpsAdminUnreadCount(
  admin: SupabaseClient,
  adminUserId: string,
): Promise<number> {
  const { count, error } = await admin
    .from('ops_admin_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('admin_user_id', adminUserId)
    .eq('is_read', false);

  if (error) return 0;
  return count ?? 0;
}

export async function listOpsAdminNotifications(
  admin: SupabaseClient,
  adminUserId: string,
  limit = 30,
): Promise<OpsAdminNotificationRow[]> {
  const { data, error } = await admin
    .from('ops_admin_notifications')
    .select('id, type, title, body, icon_emoji, action_url, is_read, metadata, created_at')
    .eq('admin_user_id', adminUserId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.warn('[ops-admin-notify] list failed', error.message);
    return [];
  }

  return (data ?? []) as OpsAdminNotificationRow[];
}

export async function markOpsAdminNotificationRead(
  admin: SupabaseClient,
  adminUserId: string,
  notificationId: string,
): Promise<boolean> {
  const { error } = await admin
    .from('ops_admin_notifications')
    .update({ is_read: true })
    .eq('id', notificationId)
    .eq('admin_user_id', adminUserId);

  return !error;
}

export async function markAllOpsAdminNotificationsRead(
  admin: SupabaseClient,
  adminUserId: string,
): Promise<void> {
  await admin
    .from('ops_admin_notifications')
    .update({ is_read: true })
    .eq('admin_user_id', adminUserId)
    .eq('is_read', false);
}
