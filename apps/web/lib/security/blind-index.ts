/**
 * Blind-index (HMAC) columns that let the app and the DB keep equality lookups / unique dedupe on values that are
 * now enc:v2 ciphertext. Key: HKDF(PII_ENCRYPTION_KEY, 'nurawell:blind-index:v1') — a system key from env, never
 * logged or returned (see field-crypto.blindIndexFor). Values are normalised (NFKC, trim, lower) before the HMAC.
 *
 *  - challenge_success_events.title_bidx  = H(title)                     — dedupe `.eq('title', …)` is rewritten to it
 *  - notifications.meta_unique_bidx       = H(kind|checkpoint_date|slot)   — replaces the metadata->>… unique indexes
 *  - notifications.meta_key_bidx          = H(metadata.dedupe_key)         — challengeNotificationExists lookup
 *
 *  - task_definitions.title_bidx         = H(dedupeNormalize(normalizeTaskTitle(title))) — habit_dedupe_key (000212)
 *  - almog_assignments.title_tok_bidx    = [H(token) …] of titleTokens(title) — the similar-title trigger (000212)
 *  - chat_task_proposals.title_bidx      = H(title) — open-proposal unique index (000212)
 *  - admin_audit_log.ip_bidx             = H(ip) — `.eq('ip', …)` lookups (000212)
 *
 * Computed by prepareWriteRow (insert/update with a plaintext source value) and by the backfill (migration 000208).
 */
import { isV2 } from '@/lib/security/field-crypto';
import { dedupeNormalize, normalizeTaskTitle, titleTokens } from '@/lib/tasks/title-normalize';

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
  task_definitions: ['title'],
  almog_assignments: ['title'],
  chat_task_proposals: ['title'],
  admin_audit_log: ['ip'],
};

/** Index columns per table (the backfill reads them to fill shared, owner-less rows once). */
export const BLIND_INDEX_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  challenge_success_events: ['title_bidx'],
  notifications: ['meta_key_bidx', 'meta_unique_bidx'],
  task_definitions: ['title_bidx'],
  almog_assignments: ['title_tok_bidx'],
  chat_task_proposals: ['title_bidx'],
  admin_audit_log: ['ip_bidx'],
};

/** Shared by the app write path and the backfill so both produce the same keys. */
export async function taskTitleBidx(title: string): Promise<string | null> {
  const k = dedupeNormalize(normalizeTaskTitle(title));
  return k ? hmac('task_definitions', 'title.dedupe', k) : null;
}
export async function titleTokenBidx(title: string): Promise<string[]> {
  return Promise.all(titleTokens(title).map((t) => hmac('almog_assignments', 'title.token', t)));
}

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
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null);
  if (table === 'task_definitions' && 'title' in row && !isV2(row.title)) {
    const t = str(row.title);
    out.title_bidx = t ? await taskTitleBidx(t) : null;
  }
  if (table === 'almog_assignments' && 'title' in row && !isV2(row.title)) {
    const t = str(row.title);
    out.title_tok_bidx = t ? await titleTokenBidx(t) : null;
  }
  if (table === 'chat_task_proposals' && 'title' in row && !isV2(row.title)) {
    const t = str(row.title);
    out.title_bidx = t ? await hmac(table, 'title', t) : null;
  }
  if (table === 'admin_audit_log' && 'ip' in row && !isV2(row.ip)) {
    const t = str(row.ip);
    out.ip_bidx = t ? await hmac(table, 'ip', t) : null;
  }
  return out;
}

/** Equality-filter rewrites: table → plain column → index column. */
const BLIND_FILTERS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  challenge_success_events: { title: 'title_bidx' },
  admin_audit_log: { ip: 'ip_bidx' },
};

/**
 * Rewrites equality filters on a blind-indexed column into the index column, so `.eq('title', X)` keeps working
 * after `title` is ciphertext. While the backfill is running, legacy plaintext rows (index still NULL) are matched
 * by the plain value too (`or=(title_bidx.eq.H,title.eq.X)`); once backfilled the plain arm never matches.
 * Returns true if the URL was changed.
 */
export async function rewriteBlindFilters(table: string, url: URL): Promise<boolean> {
  const map = BLIND_FILTERS[table];
  if (!map) return false;
  let changed = false;
  for (const [col, idx] of Object.entries(map)) {
    const f = url.searchParams.get(col);
    if (!f || !f.startsWith('eq.')) continue;
    const value = f.slice(3);
    const h = await hmac(table, col, value);
    url.searchParams.delete(col);
    if (url.searchParams.has('or')) url.searchParams.set(idx, `eq.${h}`);
    else url.searchParams.set('or', `(${idx}.eq.${h},${col}.eq.${JSON.stringify(value)})`);
    changed = true;
  }
  return changed;
}
