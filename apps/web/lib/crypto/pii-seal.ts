/**
 * כתיבה מאובטחת: משחזר placeholders של שם ([NAME] וכו') על הטקסט הגלוי ואז מצפין.
 * (הטריגרים ב-DB לא יכולים לעבוד על ciphertext.)
 */
import { createAdminClient } from '@/lib/supabase/admin';
import { isEncrypted } from './pii';
import { AI_CONTEXT_ENC_KEYS, encryptProfilePatch, encryptTableRow, TABLE_ENC_TEXT, type EncTextTable } from './pii-fields';
import { restorePiiPlaceholders } from './pii-placeholders';

type Row = Record<string, unknown>;
const PLACEHOLDER = /\[\[?\s*[A-Zא-ת_][A-Z0-9_א-ת]*\s*\]\]?/i;
const nameCache = new Map<string, { v: string | null; at: number }>();

export type FirstNameLookup = (userId: string) => Promise<string | null>;

let lookupOverride: FirstNameLookup | null = null;
/** לבדיקות בלבד */
export function __setFirstNameLookup(fn: FirstNameLookup | null) { lookupOverride = fn; nameCache.clear(); }

async function firstName(userId: string): Promise<string | null> {
  if (lookupOverride) return lookupOverride(userId);
  const c = nameCache.get(userId);
  if (c && Date.now() - c.at < 60_000) return c.v;
  const { data } = await createAdminClient().from('profiles').select('full_name').eq('id', userId).maybeSingle();
  const v = String((data as { full_name?: string | null } | null)?.full_name ?? '').trim().split(/\s+/)[0] || null;
  nameCache.set(userId, { v, at: Date.now() });
  return v;
}

const needs = (v: unknown) => typeof v === 'string' && !isEncrypted(v) && PLACEHOLDER.test(v);

async function restoreFields(row: Row, keys: readonly string[], userId: string): Promise<Row> {
  if (!keys.some((k) => needs(row[k]))) return row;
  const name = await firstName(userId);
  const out: Row = { ...row };
  for (const k of keys) if (needs(out[k])) out[k] = restorePiiPlaceholders(out[k] as string, name);
  return out;
}

export async function sealTableRow<T extends Row>(table: EncTextTable, row: T, userId: string): Promise<T> {
  const restored = await restoreFields(row, TABLE_ENC_TEXT[table], userId);
  return encryptTableRow(table, restored as T, userId);
}

export async function sealProfilePatch<T extends Row>(patch: T, userId: string): Promise<T> {
  let p: Row = patch;
  const ctx = p.ai_context;
  if (ctx && typeof ctx === 'object' && !Array.isArray(ctx)) {
    p = { ...p, ai_context: await restoreFields(ctx as Row, AI_CONTEXT_ENC_KEYS, userId) };
  }
  return encryptProfilePatch(p as T, userId);
}
