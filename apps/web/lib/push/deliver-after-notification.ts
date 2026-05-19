/**
 * אחרי insert ל-notifications — ניסיון push למכשיר (לא חוסם).
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { sendWebPushToSubscription, isWebPushConfigured } from './send-web-push';
import type { WebPushStored } from './types';

export async function deliverWebPushAfterAlmogNotification(
  userId: string,
  title: string,
  body: string
): Promise<void> {
  if (!isWebPushConfigured()) return;

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (admin as any)
    .from('profiles')
    .select('ai_context')
    .eq('id', userId)
    .maybeSingle();

  const ctx = (profile?.ai_context ?? {}) as Record<string, unknown>;
  const sub = ctx.web_push as WebPushStored | undefined;
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) return;

  const result = await sendWebPushToSubscription(sub, {
    title,
    body: body.slice(0, 180),
    url: '/home',
    tag: `almog-${userId.slice(0, 8)}`,
  });

  if (!result.ok && result.error?.includes('410')) {
    const next = { ...ctx };
    delete next.web_push;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any).from('profiles').update({ ai_context: next }).eq('id', userId);
  }
}
