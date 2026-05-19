import { deliverWebPushAfterAlmogNotification } from '../push/deliver-after-notification';

/** Fire-and-forget push אחרי התראת in-app מאלמוג */
export function afterAlmogInAppNotification(
  userId: string,
  title: string,
  body: string
): void {
  void deliverWebPushAfterAlmogNotification(userId, title, body).catch((e) => {
    console.warn('[after-almog-insert] push:', e);
  });
}
