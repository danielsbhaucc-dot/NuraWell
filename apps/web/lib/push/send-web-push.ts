/**
 * שליחת Web Push — רק כש-VAPID מוגדר (Node runtime).
 */

import 'server-only';

import type { PushSubscription } from 'web-push';
import type { WebPushSubscriptionJson } from './types';

export function isWebPushConfigured(): boolean {
  return Boolean(
    process.env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim() &&
      process.env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim() &&
      process.env.WEB_PUSH_VAPID_SUBJECT?.trim()
  );
}

export async function sendWebPushToSubscription(
  subscription: WebPushSubscriptionJson,
  payload: { title: string; body: string; url?: string; tag?: string }
): Promise<{ ok: boolean; error?: string }> {
  if (!isWebPushConfigured()) {
    return { ok: false, error: 'not_configured' };
  }

  try {
    const webpush = await import(/* webpackIgnore: true */ 'web-push');
    webpush.setVapidDetails(
      process.env.WEB_PUSH_VAPID_SUBJECT!,
      process.env.WEB_PUSH_VAPID_PUBLIC_KEY!,
      process.env.WEB_PUSH_VAPID_PRIVATE_KEY!
    );

    await webpush.sendNotification(
      subscription as PushSubscription,
      JSON.stringify({
        title: payload.title,
        body: payload.body,
        url: payload.url ?? '/home',
        tag: payload.tag ?? 'almog',
      }),
      { TTL: 60 * 60 * 4 }
    );
    await logPush(subscription, payload.tag, true);
    return { ok: true };
  } catch (e) {
    await logPush(subscription, payload.tag, false, e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/** endpoint is a capability URL → only its hash/mask is logged. */
async function logPush(sub: WebPushSubscriptionJson, tag: string | undefined, ok: boolean, error?: unknown) {
  const { logDelivery } = await import('@/lib/logging/delivery');
  const ep = (sub as { endpoint?: string }).endpoint ?? null;
  await logDelivery({ channel: 'push', purpose: tag ?? 'almog', recipient: ep, ok, error });
}
