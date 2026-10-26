/**
 * כתיבה מאובטחת: משחזר placeholders של שם ([NAME] וכו') על הטקסט הגלוי ואז מצפין.
 * (הטריגרים ב-DB לא יכולים לעבוד על ciphertext.)
 */
import { createAdminClient } from '@/lib/supabase/admin';
import { isEncrypted } from './pii';
import { AI_CONTEXT_ENC_KEYS, decryptAiContext, decryptProfileRow, encryptProfilePatch, encryptTableRow, PROFILE_ENC_NUMERIC, PROFILE_SEALED_COLUMNS, TABLE_ENC_TEXT, type EncTextTable } from './pii-fields';
import { sealRow } from '@/lib/security/field-crypto';
import { isBlocked } from '@/lib/security/field-registry';
import { firstNameFromFullName, restorePiiPlaceholders } from './pii-placeholders';
import { healthConsentStatus, patchHasHealthFields, stripHealthFields } from '@/lib/privacy/health-consent';
import { scrubHealthJson, isHealthText } from '@/lib/privacy/health-memory';
import { assertProfileEnums } from '@/lib/security/profile-enums';

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
  const v = firstNameFromFullName((data as { full_name?: string | null } | null)?.full_name);
  nameCache.set(userId, { v, at: Date.now() });
  return v;
}

const needs = (v: unknown) => typeof v === 'string' && !isEncrypted(v) && PLACEHOLDER.test(v);

export async function restoreFields(row: Row, keys: readonly string[], userId: string): Promise<Row> {
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
  assertProfileEnums(patch);
  let p: Row = patch;
  // Health-data consent withdrawn → never write health fields again until re-granted.
  const ctxHasHealth = (() => {
    const c = p.ai_context;
    if (!c || typeof c !== 'object') return false;
    try { return isHealthText(JSON.stringify(c)) || /weight|health|medical|bmi|diet|condition/i.test(Object.keys(c).join(' ')); } catch { return true; }
  })();
  if (patchHasHealthFields(p) || ctxHasHealth) {
    const status = await healthConsentStatus(userId);
    if (status !== 'granted') p = stripHealthFields(p);
    // ai_context patches usually carry the whole merged object; scrub it only after an explicit withdrawal.
    if (ctxHasHealth && status === 'withdrawn') p = { ...p, ai_context: scrubHealthJson(p.ai_context) ?? {} };
  }
  const ctx = p.ai_context;
  if (ctx && typeof ctx === 'object' && !Array.isArray(ctx)) {
    p = { ...p, ai_context: await restoreFields(ctx as Row, AI_CONTEXT_ENC_KEYS, userId) };
  }
  return sealProfileColumnsV2(p, userId) as Promise<T>;
}

/**
 * v2 write for the columns v1 encrypted (same column set, so every existing reader — all via decProfileResult —
 * keeps working). Legacy v1 values in the patch are opened first; numbers keep their numeric text form.
 * Columns v1 left plaintext stay plaintext here (their readers/SQL dependencies are tracked separately).
 */
async function sealProfileColumnsV2(p: Row, userId: string): Promise<Row> {
  const sealed = PROFILE_SEALED_COLUMNS.filter((c) => c in p && !isBlocked('profiles', c));
  if (!sealed.length) return encryptProfilePatch(p, userId);
  const subset: Row = {};
  for (const c of sealed) subset[c] = p[c];
  const plain = decryptProfileRow(subset, userId) as Row; // v1 → plain (numbers parsed, json opened)
  if ('ai_context' in plain) plain.ai_context = decryptAiContext(plain.ai_context, userId);
  for (const c of PROFILE_ENC_NUMERIC) if (c in plain && plain[c] !== null) plain[c] = String(plain[c]);
  for (const c of sealed) if (typeof subset[c] === 'string' && (subset[c] as string).startsWith('enc:v2:')) plain[c] = subset[c];
  const v2 = await sealRow('profiles', userId, userId, plain);
  const rest: Row = { ...p };
  for (const c of sealed) delete rest[c];
  return { ...encryptProfilePatch(rest, userId), ...v2 };
}
