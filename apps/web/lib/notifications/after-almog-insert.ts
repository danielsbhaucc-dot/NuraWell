/** Fire-and-forget fan-out to delivery channels (web push today; WhatsApp-ready) after an in-app notification. */
export function afterAlmogInAppNotification(userId: string, title: string, body: string): void {
  void (async () => {
    const { fanOut } = await import('./channels');
    await fanOut({ userId, title, body });
  })().catch((e) => {
    // eslint-disable-next-line no-console
    console.warn('[after-almog-insert] fan-out:', e);
  });
}
