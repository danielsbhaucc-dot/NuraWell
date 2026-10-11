/**
 * Delivery-channel abstraction for the unified notification system.
 * In-app (the `notifications` row) is always written by insertNotification; extra channels fan out
 * from here. To add WhatsApp later: implement a DeliveryChannel (respect user consent/prefs inside
 * `enabledFor`) and add it to CHANNELS — no sender changes needed.
 */
export type OutboundMessage = { userId: string; title: string; body: string; url?: string; tag?: string };

export type DeliveryChannel = {
  id: 'web_push' | 'whatsapp' | 'email';
  deliver: (msg: OutboundMessage) => Promise<void>;
};

const webPush: DeliveryChannel = {
  id: 'web_push',
  deliver: async (m) => {
    const { deliverWebPushAfterAlmogNotification } = await import('../push/deliver-after-notification');
    await deliverWebPushAfterAlmogNotification(m.userId, m.title, m.body, m.url || m.tag ? { url: m.url, tag: m.tag } : undefined);
  },
};

export const CHANNELS: DeliveryChannel[] = [webPush];

export async function fanOut(msg: OutboundMessage): Promise<void> {
  await Promise.all(
    CHANNELS.map((c) =>
      c.deliver(msg).catch((e) => {
        // eslint-disable-next-line no-console
        console.warn(`[notify-channel:${c.id}]`, e);
      })
    )
  );
}
