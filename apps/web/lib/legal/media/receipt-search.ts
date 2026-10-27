/**
 * Receipt search without a plaintext column (replaces the generated media_receipts.search_text, migrations
 * 000222/000224). The searchable text is the same concatenation the old generated column used:
 *   lower(vendor ' ' plan ' ' subject ' ' currency ' ' amount)
 * built in the app from decrypted values (subject is enc:v2 at rest). The DB only stores `search_bidx`: truncated
 * keyed-HMAC tokens (system blind-index key, never logged) of
 *   g:<1..3 char n-grams of each space-separated chunk>   -> substring (ILIKE '%w%') candidates
 *   t:<pg_trgm trigrams of each letter/digit word>         -> fuzzy (word_similarity) candidates
 * Search = candidate prefilter on tokens (+ rows whose index is still NULL), then the exact legacy predicate on the
 * decrypted text in the app; fuzzy scores come from public.legal_word_similarity (pg_trgm on values passed in, no
 * table access), so results equal the old SQL. Tokens are 64-bit truncations: collisions only widen the candidate set.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { isV2 } from '@/lib/security/field-crypto';

type Row = Record<string, unknown>;
export const RECEIPT_SEARCH_SOURCES = ['vendor', 'plan', 'subject', 'currency', 'amount'] as const;
const TOKEN_HEX = 16;
/** pg_trgm.word_similarity_threshold default (the old `p_q <% search_text`) */
export const FUZZY_THRESHOLD = 0.6;

const s = (v: unknown) => (v == null ? '' : String(v));
/** Same text as the dropped generated column. */
export function receiptSearchText(r: Row): string {
  return `${s(r.vendor)} ${s(r.plan)} ${s(r.subject)} ${s(r.currency)} ${s(r.amount)}`.toLowerCase();
}

/** 1..3-grams of a space-free chunk */
export function charGrams(chunk: string): string[] {
  const c = [...chunk];
  const out = new Set<string>();
  for (let n = 1; n <= 3; n++) for (let i = 0; i + n <= c.length; i++) out.add(c.slice(i, i + n).join(''));
  return [...out];
}
/** grams that every text containing `w` must have: w itself when short, else its 3-grams */
export function queryGrams(w: string): string[] {
  const c = [...w];
  if (c.length <= 3) return [w];
  const out = new Set<string>();
  for (let i = 0; i + 3 <= c.length; i++) out.add(c.slice(i, i + 3).join(''));
  return [...out];
}
/** pg_trgm show_trgm(): words = runs of letters/digits, lower-cased, padded '  w ' */
export function pgTrigrams(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.toLowerCase().matchAll(/[\p{L}\p{N}]+/gu)) {
    const c = [' ', ' ', ...m[0], ' '];
    for (let i = 0; i + 3 <= c.length; i++) out.add(c.slice(i, i + 3).join(''));
  }
  return [...out];
}

async function tok(kind: 'g' | 't', v: string): Promise<string> {
  const { blindIndexFor } = await import('@/lib/security/field-crypto');
  return blindIndexFor('media_receipts', `search.${kind}`, v).slice(0, TOKEN_HEX);
}

export async function receiptSearchTokens(text: string): Promise<string[]> {
  const g = new Set(text.split(' ').filter(Boolean).flatMap(charGrams));
  const t = pgTrigrams(text);
  const out = await Promise.all([...[...g].map((x) => tok('g', x)), ...t.map((x) => tok('t', x))]);
  return [...new Set(out)].sort();
}

/**
 * Write path (prepareWriteRow): a full row (all five sources, subject still plaintext) gets its tokens; a partial
 * update of a source column clears the index (row stays findable through the NULL branch) and the writer refreshes it.
 */
export async function receiptSearchPatch(row: Row): Promise<Row> {
  const touched = RECEIPT_SEARCH_SOURCES.filter((c) => c in row);
  if (!touched.length) return {};
  const full = touched.length === RECEIPT_SEARCH_SOURCES.length && !isV2(row.subject);
  return { search_bidx: full ? await receiptSearchTokens(receiptSearchText(row)) : null };
}

/** Recompute one receipt's index from its decrypted values (after a partial update). */
export async function refreshReceiptSearch(db: SupabaseClient, id: string): Promise<boolean> {
  const { data } = await db.from('media_receipts').select('id, vendor, plan, subject, currency, amount').eq('id', id).maybeSingle();
  if (!data) return false;
  const { error } = await db.from('media_receipts').update({ search_bidx: await receiptSearchTokens(receiptSearchText(data as Row)) }).eq('id', id);
  return !error;
}

/** Fill rows whose index is NULL (backfill / repair). Counts only. */
export async function backfillReceiptSearch(db: SupabaseClient, limit = 500): Promise<{ filled: number; failed: number; remaining: number }> {
  const { data } = await db.from('media_receipts').select('id').is('search_bidx', null).limit(limit);
  let filled = 0;
  let failed = 0;
  for (const r of (data ?? []) as Array<{ id: string }>) (await refreshReceiptSearch(db, r.id)) ? filled++ : failed++;
  const { count } = await db.from('media_receipts').select('id', { count: 'exact', head: true }).is('search_bidx', null);
  return { filled, failed, remaining: count ?? -1 };
}

const pgArr = (xs: string[]) => `{${xs.join(',')}}`;

/** PostgREST or-filter selecting candidates for any of `words` (substring) — plus not-yet-indexed rows. */
export async function substringFilter(words: string[]): Promise<string | null> {
  const parts: string[] = [];
  for (const w of words.filter(Boolean)) {
    // a phrase with spaces: each space-free part lies inside one chunk, so all their grams must be present
    const grams = [...new Set(w.split(' ').filter(Boolean).flatMap(queryGrams))];
    if (grams.length) parts.push(`search_bidx.cs.${pgArr(await Promise.all(grams.map((x) => tok('g', x))))}`);
  }
  return parts.length ? [...parts, 'search_bidx.is.null'].join(',') : null;
}
export async function fuzzyFilter(q: string): Promise<string | null> {
  const t = pgTrigrams(q);
  if (!t.length) return null;
  return `search_bidx.ov.${pgArr(await Promise.all(t.map((x) => tok('t', x))))},search_bidx.is.null`;
}

/** The old predicate: any word is a substring of the text (ILIKE '%w%'; words are already lower-case). */
export const matchesAnyWord = (text: string, words: string[]) => words.some((w) => w && text.includes(w.toLowerCase()));

type Searchable = { id: string } & Row;
const SEL = 'id, vendor, plan, subject, currency, amount';

/** ILIKE-equivalent receipt search (legal hub + CEO tool). Returns ids in id order, at most `limit`. */
export async function searchReceiptIds(db: SupabaseClient, words: string[], limit = 40): Promise<string[]> {
  const f = await substringFilter(words);
  if (!f) return [];
  const { data } = await db.from('media_receipts').select(SEL).or(f).order('id').limit(2000);
  return ((data ?? []) as Searchable[]).filter((r) => matchesAnyWord(receiptSearchText(r), words)).slice(0, limit).map((r) => r.id);
}

/** Old legal_hub_fuzzy receipt branch: word_similarity(q, text) with `q <% text or text ilike %q%`, score desc. */
export async function fuzzyReceipts(db: SupabaseClient, q: string, limit = 40): Promise<Array<{ id: string; score: number }>> {
  if (q.length < 3) return [];
  const f = await fuzzyFilter(q);
  const { data } = f ? await db.from('media_receipts').select(SEL).or(f).order('id').limit(2000) : { data: [] };
  const rows = (data ?? []) as Searchable[];
  if (!rows.length) return [];
  const texts = rows.map((r) => receiptSearchText(r));
  const { data: sims, error } = await db.rpc('legal_word_similarity', { p_q: q, p_texts: texts });
  if (error || !Array.isArray(sims)) return [];
  const low = q.toLowerCase();
  return rows
    .map((r, i) => ({ id: r.id, score: Number((sims as number[])[i] ?? 0), hit: texts[i]!.includes(low) }))
    .filter((x) => x.score >= FUZZY_THRESHOLD || x.hit)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Math.min(limit, 100)))
    .map(({ id, score }) => ({ id, score }));
}
