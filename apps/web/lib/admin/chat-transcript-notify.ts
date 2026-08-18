import type { SupabaseClient } from '@supabase/supabase-js';
import { deliverWebPushAfterAlmogNotification } from '@/lib/push/deliver-after-notification';

const PLATFORM_NOTIFICATION_META = {
  channel: 'platform',
  mentor: null,
  category: 'privacy',
} as const;

export async function notifyTranscriptAccessRequest(
  admin: SupabaseClient,
  params: {
    userId: string;
    sessionId: string;
    requestId: string;
    reason: string;
  },
): Promise<{ ok: true; notificationId: string } | { ok: false; error: string }> {
  const actionUrl = `/settings/privacy?transcript_request=${params.requestId}`;

  const { data, error } = await admin
    .from('notifications')
    .insert({
      user_id: params.userId,
      type: 'transcript_access_request',
      title: 'בקשה לצפייה בתמליל שיחה',
      body: 'צוות NuraWell מבקש אישורך לצפות בתמליל שיחה. לחץ/י לאישור או דחייה.',
      icon_emoji: '🔒',
      action_url: actionUrl,
      is_read: false,
      is_sent: true,
      send_at: new Date().toISOString(),
      metadata: {
        ...PLATFORM_NOTIFICATION_META,
        source: 'admin_transcript_security',
        session_id: params.sessionId,
        request_id: params.requestId,
        reason_preview: params.reason.slice(0, 120),
      },
    })
    .select('id')
    .single();

  if (error) {
    console.error('[transcript-access-notify] insert failed', error.message);
    return { ok: false, error: error.message };
  }

  void deliverWebPushAfterAlmogNotification(
    params.userId,
    'בקשה לצפייה בתמליל שיחה',
    'נדרש אישורך — הגדרות פרטיות',
    { url: actionUrl, tag: `transcript-req-${params.requestId.slice(0, 8)}` },
  ).catch((e) => {
    console.warn('[transcript-access-notify] push failed', e);
  });

  const { markTranscriptRequestNotificationSent } = await import('./chat-transcript-security');
  await markTranscriptRequestNotificationSent(admin, params.requestId, data.id as string);

  return { ok: true, notificationId: data.id as string };
}

export async function revokeTranscriptAccessNotification(
  admin: SupabaseClient,
  params: { notificationId: string; userId: string },
): Promise<void> {
  const { error } = await admin
    .from('notifications')
    .delete()
    .eq('id', params.notificationId)
    .eq('user_id', params.userId);

  if (error) {
    console.warn('[transcript-access-notify] delete notification failed', error.message);
  }
}

export async function notifyTranscriptSentToUser(
  admin: SupabaseClient,
  params: {
    userId: string;
    sessionId: string;
    sessionTitle: string | null;
  },
): Promise<void> {
  const actionUrl = `/home?chatSession=${params.sessionId}`;
  const title = params.sessionTitle?.trim() || 'שיחה עם אלמוג';

  const { error } = await admin.from('notifications').insert({
    user_id: params.userId,
    type: 'chat_transcript_delivered',
    title: 'עותק השיחה שלך',
    body: `שלחנו אליך/ אלייך קישור לשיחה "${title}". ניתן לצפות בה באפליקציה.`,
    icon_emoji: '💬',
    action_url: actionUrl,
    is_read: false,
    is_sent: true,
    send_at: new Date().toISOString(),
    metadata: {
      ...PLATFORM_NOTIFICATION_META,
      source: 'admin_transcript_delivery',
      session_id: params.sessionId,
    },
  });

  if (error) {
    console.warn('[transcript-deliver-notify] insert failed', error.message);
  }

  void deliverWebPushAfterAlmogNotification(
    params.userId,
    'עותק השיחה שלך',
    title,
    { url: actionUrl, tag: `transcript-del-${params.sessionId.slice(0, 8)}` },
  ).catch((e) => {
    console.warn('[transcript-deliver-notify] push failed', e);
  });
}
