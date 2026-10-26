/**
 * Pre-seal preparation for writes to v2 tables (used by the server fetch wrapper in field-fetch.ts).
 *
 * Two DB triggers used to work on the plaintext and cannot once the value arrives sealed, so their work moves here:
 *  - restore-PII triggers ([NAME] placeholders → first name): a no-op on ciphertext, so placeholders are restored
 *    on the plaintext before sealing;
 *  - notifications_set_dedupe: computes dedupe_key = md5(source|norm(title)|norm(body)) when it is null. On
 *    ciphertext that hash would be unique per write, so the same key is computed here from the plaintext
 *    (the key is a hash, not the text, so the dedupe index keeps working without exposing content).
 */
import { createHash } from 'node:crypto';
import { encryptedTable, isBlocked } from '@/lib/security/field-registry';
import { isV2 } from '@/lib/security/field-crypto';
import { BLIND_INDEX_SOURCES, blindIndexPatch } from '@/lib/security/blind-index';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Row = Record<string, unknown>;

/** columns the DB restore-PII triggers used to fill in, per table */
export const RESTORE_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  ai_interactions: ['content'], // assistant rows only (checked below)
  chat_sessions: ['title', 'summary', 'preview_text'],
  chat_periodic_summaries: ['ai_insight'],
  notifications: ['title', 'body'],
  periodic_summaries: ['ai_insight'],
  user_insights: ['insight_text'],
  user_memories: ['memory_text'],
  user_mentorship_strategy: ['psychological_approach', 'next_best_action'],
};

/** registered, non-BLOCKED columns in `row` whose value is not already enc:v2 */
export function sealedWriteCols(table: string, row: Row): string[] {
  const spec = encryptedTable(table);
  if (!spec) return [];
  return Object.keys(spec.columns).filter((c) => {
    if (!(c in row) || isBlocked(table, c)) return false;
    const v = row[c];
    if (v === null || v === undefined) return false;
    if (Array.isArray(v)) return v.some((x) => !isV2(x));
    return !isV2(v);
  });
}

/** Port of public.dedupe_normalize (SQL): lower, non-alnum (incl. Hebrew letters kept) → space, squash, trim. */
export function dedupeNormalize(t: unknown): string {
  return String(t ?? '')
    .replace(/[^\p{L}\p{N}\u05D0-\u05EA]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}

export function notificationDedupeKey(row: Row): string {
  const meta = row.metadata as Row | null | undefined;
  const idem = meta && typeof meta === 'object' ? meta.idempotency_key : null;
  if (typeof idem === 'string' && idem) return idem;
  return createHash('md5').update(`${row.source ?? ''}|${dedupeNormalize(row.title)}|${dedupeNormalize(row.body)}`).digest('hex');
}

export async function prepareWriteRow(table: string, row: Row): Promise<Row> {
  let r = row;
  const spec = encryptedTable(table);
  const userId = spec ? r[spec.userCol] : undefined;
  const keys = RESTORE_COLUMNS[table]?.filter((c) => c in r);
  if (keys?.length && typeof userId === 'string' && !(table === 'ai_interactions' && r.role !== 'assistant')) {
    const { restoreFields } = await import('@/lib/crypto/pii-seal');
    r = await restoreFields(r, keys, userId);
  }
  if (table === 'notifications' && r.dedupe_key == null && ('title' in r || 'body' in r) && !isV2(r.title) && !isV2(r.body)) {
    // insert only: an update without dedupe_key keeps the stored key (the trigger only fills NULL)
    if ('source' in r && 'title' in r && 'body' in r) r = { ...r, dedupe_key: notificationDedupeKey(r) };
  }
  // technical filter keys mirrored out of encrypted metadata into plain columns (migration 000204)
  const meta = r.metadata;
  const plainMeta = meta && typeof meta === 'object' && !Array.isArray(meta) ? (meta as Row) : null;
  if ('metadata' in r && !isV2(meta)) {
    if (table === 'ai_interactions' && !('redaction_notice' in r)) r = { ...r, redaction_notice: plainMeta?.redaction_notice === true };
    if (table === 'scheduled_reminders' && !('source' in r))
      r = { ...r, source: typeof plainMeta?.source === 'string' ? plainMeta.source : null };
    // consent evidence links read by trg_user_consents_to_history (migration 000208) instead of metadata->>…
    if (table === 'user_consents') {
      const str = (k: string) => (typeof plainMeta?.[k] === 'string' && plainMeta[k] ? (plainMeta[k] as string) : null);
      const uuid = str('evidence_id');
      if (!('evidence_id' in r)) r = { ...r, evidence_id: uuid && UUID_RE.test(uuid) ? uuid : null };
      if (!('request_id' in r)) r = { ...r, request_id: str('request_id') };
      if (!('choice' in r)) r = { ...r, choice: str('choice') };
    }
  }
  // HMAC blind-index columns for lookups/dedupe on encrypted values (migration 000208)
  if (BLIND_INDEX_SOURCES[table]?.some((c) => c in r)) r = { ...r, ...(await blindIndexPatch(table, r)) };
  return r;
}
