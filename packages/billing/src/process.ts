import { createHash } from 'node:crypto';
import type { PaymentProvider, NormalizedEvent, WebhookInput } from './providers/types';
import { eventIdempotencyKey, type EventStore } from './webhooks';
import type { BillingEventKind } from './state-machine';

export type WebhookOutcome =
  | { status: 'rejected'; error: string }
  | { status: 'duplicate'; key: string }
  | { status: 'accepted'; key: string; event: NormalizedEvent; billingEvent: BillingEventKind | null };

/** Maps a provider-normalized event to a state-machine event. */
export function toBillingEvent(e: NormalizedEvent): BillingEventKind | null {
  switch (e.kind) {
    case 'payment_succeeded': return 'renewed';
    case 'payment_failed': return 'payment_failed';
    case 'subscription_canceled': return 'cancel_requested';
    case 'refund_succeeded': return 'refunded_and_ended';
    default: return null;
  }
}

/**
 * Verify signature (and timestamp window) via the provider, then record the event once in the
 * append-only store. A second delivery with the same provider event id is a no-op ('duplicate').
 * The caller applies `billingEvent` to the subscription only when status === 'accepted'.
 */
export async function processWebhook(p: { productId: string; provider: PaymentProvider; input: WebhookInput; store: EventStore }): Promise<WebhookOutcome> {
  let event: NormalizedEvent;
  try { event = await p.provider.parseWebhook(p.input); }
  catch (e) { return { status: 'rejected', error: e instanceof Error ? e.message : 'invalid' }; }
  if (!event?.providerEventId || !event.kind) return { status: 'rejected', error: 'malformed' };
  const key = eventIdempotencyKey(p.provider.name, event.providerEventId);
  const payloadHash = createHash('sha256').update(p.input.rawBody).digest('hex');
  const r = await p.store.insertOnce({ productId: p.productId, provider: p.provider.name, key, kind: event.kind, payloadHash });
  if (r === 'duplicate') return { status: 'duplicate', key };
  return { status: 'accepted', key, event, billingEvent: toBillingEvent(event) };
}
