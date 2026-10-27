import { notificationMetaKeyBidx } from '@/lib/security/blind-index';
import { insertNotification } from '@/lib/module-api/notifications/lib-notifications-deliver';
import type { SupabaseClient } from '@supabase/supabase-js';
import { deliverWebPushAfterAlmogNotification } from '@/lib/module-api/notifications/lib-push-deliver-after-notification';

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
  await insertNotification(admin, {
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
  // metadata is enc:v2: match on the HMAC blind index (000208); legacy plaintext rows (index still NULL until
  // the backfill reaches them) are matched on the plain JSON too.
  const bidx = await notificationMetaKeyBidx(dedupeKey);
  const { data } = await admin
    .from('notifications')
    .select('id')
    .eq('user_id', userId)
    .or(`meta_key_bidx.eq.${bidx},metadata->>dedupe_key.eq.${JSON.stringify(dedupeKey)}`)
    .limit(1)
    .maybeSingle();
  return Boolean(data);
}
