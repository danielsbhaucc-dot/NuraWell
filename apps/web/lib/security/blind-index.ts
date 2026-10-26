/**
 * Blind-index (HMAC) columns that let the app and the DB keep equality lookups / unique dedupe on values that are
 * now enc:v2 ciphertext. Key: HKDF(PII_ENCRYPTION_KEY, 'nurawell:blind-index:v1') — a system key from env, never
 * logged or returned (see field-crypto.blindIndexFor). Values are normalised (NFKC, trim, lower) before the HMAC.
 *
 *  - challenge_success_events.title_bidx  = H(title)                     — dedupe `.eq('title', …)` is rewritten to it
 *  - notifications.meta_unique_bidx       = H(kind|checkpoint_date|slot)   — replaces the metadata->>… unique indexes
 *  - notifications.meta_key_bidx          = H(metadata.dedupe_key)         — challengeNotificationExists lookup
 *
 * Computed by prepareWriteRow (insert/update with a plaintext source value) and by the backfill (migration 000208).
 */
import { isV2 } from '@/lib/security/field-crypto';

type Row = Record<string, unknown>;

/** Lazily resolved so modules that only need the column names do not load key material. */
async function hmac(table: string, column: string, value: string): Promise<string> {
  const { blindIndexFor } = await import('@/lib/security/field-crypto');
  return blindIndexFor(table, column, value);
}

function plainObject(v: unknown): Row | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : null;
}

/** The unique notification scope formerly enforced by expression indexes on metadata (000024 / 000089). */
export function notificationUniqueScope(metadata: unknown): string | null {
  const m = plainObject(metadata);
  const source = m?.source; // the old indexes keyed on metadata->>'source'
  if (!m || typeof m.checkpoint_date !== 'string' || !m.checkpoint_date) return null;
  if (source === 'almog_habit_checkpoint' && m.slot != null && m.slot !== '') return `habit|${m.checkpoint_date}|${String(m.slot)}`;
  if (source === 'almog_personalized_check_in' && m.check_in_index != null && m.check_in_index !== '')
    return `checkin|${m.checkpoint_date}|${String(m.check_in_index)}`;
  return null;
}

export async function notificationMetaKeyBidx(dedupeKey: string): Promise<string> {
  return hmac('notifications', 'metadata.dedupe_key', dedupeKey);
}

/** Plain columns that blind-index columns are derived from, per table. */
export const BLIND_INDEX_SOURCES: Readonly<Record<string, readonly string[]>> = {
  challenge_success_events: ['title'],
  notifications: ['metadata'],
};

/**
 * Blind-index columns to add to a write. Only when the source value is present and plaintext (an enc:v2 value
 * keeps the stored index).
 */
export async function blindIndexPatch(table: string, row: Row): Promise<Row> {
  const out: Row = {};
  if (table === 'challenge_success_events' && 'title' in row && !isV2(row.title)) {
    out.title_bidx = typeof row.title === 'string' && row.title ? await hmac(table, 'title', row.title) : null;
  }
  if (table === 'notifications' && 'metadata' in row && !isV2(row.metadata)) {
    const m = plainObject(row.metadata);
    const key = m && typeof m.dedupe_key === 'string' && m.dedupe_key ? m.dedupe_key : null;
    out.meta_key_bidx = key ? await notificationMetaKeyBidx(key) : null;
    const scope = notificationUniqueScope(row.metadata);
    out.meta_unique_bidx = scope ? await hmac(table, 'metadata.unique_scope', scope) : null;
  }
  return out;
}

/**
 * Rewrites equality filters on a blind-indexed column into the index column, so `.eq('title', X)` keeps working
 * after `title` is ciphertext. While the backfill is running, legacy plaintext rows (index still NULL) are matched
 * by the plain value too (`or=(title_bidx.eq.H,title.eq.X)`); once backfilled the plain arm never matches.
 * Returns true if the URL was changed.
 */
export async function rewriteBlindFilters(table: string, url: URL): Promise<boolean> {
  if (table !== 'challenge_success_events') return false;
  const f = url.searchParams.get('title');
  if (!f || !f.startsWith('eq.')) return false;
  const value = f.slice(3);
  const h = await hmac(table, 'title', value);
  url.searchParams.delete('title');
  if (url.searchParams.has('or')) url.searchParams.set('title_bidx', `eq.${h}`);
  else url.searchParams.set('or', `(title_bidx.eq.${h},title.eq.${JSON.stringify(value)})`);
  return true;
}
