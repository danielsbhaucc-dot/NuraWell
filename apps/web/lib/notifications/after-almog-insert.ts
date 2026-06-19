/** Fire-and-forget push אחרי התראת in-app מאלמוג (לא חוסם; web-push רק ב-Node). */
export function afterAlmogInAppNotification(
  userId: string,
  title: string,
  body: string
): void {
  void (async () => {
    const { deliverWebPushAfterAlmogNotification } = await import('../push/deliver-after-notification');
    await deliverWebPushAfterAlmogNotification(userId, title, body);
  })().catch((e) => {
    // eslint-disable-next-line no-console
    console.warn('[after-almog-insert] push:', e);
  });
}
