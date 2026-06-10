/**
 * אחרי insert ל-notifications — ניסיון push למכשיר (לא חוסם).
 */

import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { isAvoidPushActive } from '@/lib/ai/avoid-push';
import type { WebPushStored } from './types';

export async function deliverWebPushAfterAlmogNotification(
  userId: string,
  title: string,
  body: string
): Promise<void> {
  const { sendWebPushToSubscription, isWebPushConfigured } = await import('./send-web-push');
  if (!isWebPushConfigured()) return;

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await admin
    .from('profiles')
    .select('ai_context')
    .eq('id', userId)
    .maybeSingle();

  const ctx = (profile?.ai_context ?? {}) as Record<string, unknown>;
  /** avoid_push חוסם רק Web Push למכשיר — לא התראות in-app בפעמון. */
  if (isAvoidPushActive(ctx)) return;

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
    await admin.from('profiles').update({ ai_context: next }).eq('id', userId);
  }
}
