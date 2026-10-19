/**
 * Structured outbound-delivery log. Never stores content, codes, tokens or full recipients:
 * recipient → HMAC hash (for correlation) + short mask. Errors are redacted and truncated.
 * Logging must never break or delay a send beyond one insert; all failures are swallowed here only.
 */
import { createHmac } from 'node:crypto';

export type DeliveryChannel = 'email' | 'telegram' | 'push' | 'sms' | 'other';

export function redactError(e: unknown): string {
  return String(e instanceof Error ? e.message : e)
    .replace(/bot\d+:[\w-]+/g, 'bot***')
    .replace(/(Bearer\s+)[\w.-]+/gi, '$1***')
    .replace(/\b(re|sk|pk|key)_[\w-]{8,}/gi, '***')
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, (m) => maskRecipient(m))
    .replace(/\b\d{6}\b/g, '******')
    .slice(0, 200);
}

export function maskRecipient(r: string): string {
  const s = r.trim();
  const at = s.indexOf('@');
  if (at > 0) return `${s[0]}***@${s.slice(at + 1)}`;
  return s.length <= 4 ? '***' : `***${s.slice(-3)}`;
}

export function hashRecipient(r: string): string {
  const salt = process.env.LOG_HASH_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY || 'nw';
  return createHmac('sha256', salt).update(r.trim().toLowerCase()).digest('hex').slice(0, 24);
}

export async function logDelivery(e: {
  channel: DeliveryChannel; purpose?: string; recipient?: string | null; ok: boolean; providerId?: string | null; error?: unknown;
}): Promise<void> {
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    await createAdminClient().from('delivery_log').insert({
      channel: e.channel,
      purpose: (e.purpose ?? 'general').slice(0, 60),
      recipient_hash: e.recipient ? hashRecipient(e.recipient) : null,
      recipient_mask: e.recipient ? maskRecipient(e.recipient) : null,
      ok: e.ok,
      provider_id: e.providerId ? String(e.providerId).slice(0, 80) : null,
      error: e.ok || e.error == null ? null : redactError(e.error),
    });
  } catch {
    /* logging is best-effort; never throw from here */
  }
}
