import { createHmac, timingSafeEqual } from 'node:crypto';

export const DEFAULT_TOLERANCE_SEC = 300;

export function signPayload(secret: string, timestampSec: number, rawBody: string): string {
  return createHmac('sha256', secret).update(`${timestampSec}.${rawBody}`).digest('hex');
}

export type VerifyResult = { ok: true } | { ok: false; error: 'missing_signature' | 'bad_signature' | 'stale_timestamp' };

/** HMAC-SHA256 over `${t}.${body}`, constant-time compare, timestamp window against replay. */
export function verifySignature(p: { secret: string; rawBody: string; signature: string | null; timestampSec: number | null; nowSec?: number; toleranceSec?: number }): VerifyResult {
  if (!p.signature || !p.timestampSec || !p.secret) return { ok: false, error: 'missing_signature' };
  const now = p.nowSec ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - p.timestampSec) > (p.toleranceSec ?? DEFAULT_TOLERANCE_SEC)) return { ok: false, error: 'stale_timestamp' };
  const expected = Buffer.from(signPayload(p.secret, p.timestampSec, p.rawBody), 'hex');
  let got: Buffer;
  try { got = Buffer.from(p.signature, 'hex'); } catch { return { ok: false, error: 'bad_signature' }; }
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) return { ok: false, error: 'bad_signature' };
  return { ok: true };
}

/** Idempotency key for a provider event; the event store has a unique index on (product_id, provider, key). */
export function eventIdempotencyKey(provider: string, providerEventId: string): string {
  return `${provider}:${providerEventId}`;
}

/** Storage-agnostic event log port (append-only). insert returns 'duplicate' on unique violation. */
export type EventStore = { insertOnce(e: { productId: string; provider: string; key: string; kind: string; payloadHash: string }): Promise<'inserted' | 'duplicate'> };
