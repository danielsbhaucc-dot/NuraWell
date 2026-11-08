/**
 * billing_invoices.doc_url may embed provider access tokens in the query string.
 * At rest: enc:v2 under the invoice owner's DEK (field-registry).
 * Navigation: decrypt on an authorized server path, then use the plaintext URL as href —
 * never expose ciphertext to the browser as a link. Does not fetch the remote document.
 */
import { decryptValue, encryptValue, isV2 } from '@/lib/security/field-crypto';

const TABLE = 'billing_invoices';
const COL = 'doc_url';

/** Seal a provider document URL for insert/upsert via sealed writers. */
export async function sealInvoiceDocUrl(userId: string, invoiceId: string, url: string): Promise<string> {
  const plain = url.trim();
  if (!plain) throw new Error('invoice_doc_url_empty');
  if (isV2(plain)) throw new Error('invoice_doc_url_already_sealed');
  const sealed = await encryptValue(TABLE, COL, userId, invoiceId, plain);
  if (typeof sealed !== 'string' || !sealed.startsWith('enc:v2:') || sealed.includes(plain)) {
    throw new Error('invoice_doc_url_seal_failed');
  }
  return sealed;
}

/** Authorized decrypt for navigation / display. Returns null if missing, wrong key, or non-URL. */
export async function decryptInvoiceDocUrl(
  userId: string,
  invoiceId: string,
  stored: string | null | undefined,
): Promise<string | null> {
  if (!stored) return null;
  if (!stored.startsWith('enc:')) {
    // legacy plaintext (pre-register) — only http(s) URLs
    return /^https?:\/\//i.test(stored.trim()) ? stored.trim() : null;
  }
  if (!isV2(stored)) return null;
  try {
    const plain = await decryptValue(TABLE, COL, userId, invoiceId, stored);
    if (typeof plain !== 'string' || !plain || plain.startsWith('enc:')) return null;
    return /^https?:\/\//i.test(plain.trim()) ? plain.trim() : null;
  } catch {
    return null;
  }
}
