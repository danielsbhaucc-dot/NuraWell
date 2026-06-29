import type { SupabaseClient } from '@supabase/supabase-js';
import { deliverWebPushAfterAlmogNotification } from '@/lib/push/deliver-after-notification';

export type ChallengeNotifyParams = {
  userId: string;
  title: string;
  body: string;
  actionUrl: string;
  type: string;
  dedupeKey?: string;
  push?: boolean;
};

/** התראת in-app + Web Push (אם מוגדר) */
export async function sendChallengeNotification(
  admin: SupabaseClient,
  params: ChallengeNotifyParams,
): Promise<void> {
  await admin.from('notifications').insert({
    user_id: params.userId,
    type: params.type,
    title: params.title,
    body: params.body,
    icon_emoji: '🏆',
    action_url: params.actionUrl,
    is_read: false,
    is_sent: false,
    send_at: new Date().toISOString(),
    metadata: {
      source: 'challenge',
      mentor: 'almog',
      ...(params.dedupeKey ? { dedupe_key: params.dedupeKey } : {}),
    },
  });

  if (params.push !== false) {
    void deliverWebPushAfterAlmogNotification(params.userId, params.title, params.body, {
      url: params.actionUrl,
      tag: params.dedupeKey ?? `challenge-${params.userId.slice(0, 8)}`,
    }).catch((e) => {
      console.warn('[challenge-notify] push failed', e);
    });
  }
}

export async function challengeNotificationExists(
  admin: SupabaseClient,
  userId: string,
  dedupeKey: string,
): Promise<boolean> {
  const { data } = await admin
    .from('notifications')
    .select('id')
    .eq('user_id', userId)
    .contains('metadata', { dedupe_key: dedupeKey })
    .limit(1)
    .maybeSingle();
  return Boolean(data);
}
