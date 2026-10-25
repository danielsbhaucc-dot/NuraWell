/**
 * Per-user field envelope encryption, wired for the data layer.
 *
 *   KMS -> PII_ENCRYPTION_KEY (existing, KMS-loaded; KMS_WRAPPED mode untouched)
 *       -> HKDF "nurawell:field-kek:v1"   = FIELD_KEK   (wraps per-user DEKs, table user_data_keys)
 *       -> HKDF "nurawell:blind-index:v1" = index key   (equality lookups on encrypted columns)
 *   per-user DEK -> field value, AAD = nurawell:field:<table>:<column>:<rowId>
 *
 * So a value is bound to its user (DEK), its table+column and its row (AAD). Deleting the user's
 * user_data_keys row crypto-shreds every enc:v2 value of that user, including copies in backups.
 */
import { hkdfSync } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ensureKmsKeysSync } from '@/lib/security/kms-envelope';
import {
  FIELD_PREFIX,
  blindIndex,
  decryptField,
  encryptField,
  fieldAad,
  newDataKey,
  unwrapDataKey,
  type WrappedDek,
} from '@/lib/security/field-envelope';
import { encryptedTable, isBlocked, keyColumns, rowKeyOf, type FieldKind } from '@/lib/security/field-registry';

export const FIELD_KEK_VERSION = 1;

type Keys = { fieldKek: Buffer; indexKey: Buffer };
let keys: Keys | null = null;

function rootKey(): Buffer {
  ensureKmsKeysSync();
  const raw = process.env.PII_ENCRYPTION_KEY?.trim();
  if (!raw) throw new Error('PII_ENCRYPTION_KEY missing');
  const k = Buffer.from(raw, raw.length === 64 && /^[0-9a-f]+$/i.test(raw) ? 'hex' : 'base64');
  if (k.length !== 32) throw new Error('PII_ENCRYPTION_KEY must be 32 bytes');
  return k;
}

function derive(): Keys {
  if (keys) return keys;
  const ikm = rootKey();
  const d = (info: string) => Buffer.from(hkdfSync('sha256', ikm, Buffer.from('nurawell'), Buffer.from(info), 32));
  keys = { fieldKek: d(`nurawell:field-kek:v${FIELD_KEK_VERSION}`), indexKey: d('nurawell:blind-index:v1') };
  return keys;
}

/** tests only */
export function __resetFieldCrypto(): void {
  keys = null;
  dekCache.clear();
  store = null;
}

// ---------------------------------------------------------------- DEK store (service role, cached)

export type DekStore = {
  get(userId: string): Promise<WrappedDek | null>;
  /** insert if absent; returns whatever row is stored afterwards (race-safe). */
  putIfAbsent(userId: string, wrapped: WrappedDek): Promise<WrappedDek>;
};

const DEK_TTL_MS = 5 * 60_000;
const DEK_MAX = 2_000;
const dekCache = new Map<string, { dek: Buffer; at: number }>();
let store: DekStore | null = null;

function rawServiceClient(): SupabaseClient {
  // deliberately NOT the wrapped client: user_data_keys must never pass through the field transform.
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function supabaseDekStore(): DekStore {
  const db = rawServiceClient();
  return {
    async get(userId) {
      const { data, error } = await db.from('user_data_keys').select('wrapped').eq('user_id', userId).maybeSingle();
      if (error) throw new Error(`user_data_keys read failed: ${error.code ?? 'unknown'}`);
      return (data?.wrapped as WrappedDek | undefined) ?? null;
    },
    async putIfAbsent(userId, wrapped) {
      const { error } = await db
        .from('user_data_keys')
        .upsert({ user_id: userId, wrapped, kek_version: wrapped.kekv }, { onConflict: 'user_id', ignoreDuplicates: true });
      if (error) throw new Error(`user_data_keys write failed: ${error.code ?? 'unknown'}`);
      const again = await this.get(userId);
      if (!again) throw new Error('user_data_keys row missing after insert');
      return again;
    },
  };
}

export function setDekStoreForTests(s: DekStore | null): void {
  store = s;
  dekCache.clear();
}

function dekStore(): DekStore {
  return (store ??= supabaseDekStore());
}

/** Returns the user's DEK; with create=true makes one on first use (writes only). */
export async function userDek(userId: string, opts: { create: boolean }): Promise<Buffer | null> {
  const hit = dekCache.get(userId);
  if (hit && Date.now() - hit.at < DEK_TTL_MS) return hit.dek;
  const { fieldKek } = derive();
  let wrapped = await dekStore().get(userId);
  if (!wrapped) {
    if (!opts.create) return null;
    wrapped = await dekStore().putIfAbsent(userId, newDataKey(fieldKek, FIELD_KEK_VERSION, userId).wrapped);
  }
  const dek = unwrapDataKey(fieldKek, wrapped, userId);
  if (dekCache.size >= DEK_MAX) dekCache.delete(dekCache.keys().next().value as string);
  dekCache.set(userId, { dek, at: Date.now() });
  return dek;
}

// ---------------------------------------------------------------- values

export const FIELD_PREFIX_MARK = FIELD_PREFIX;
export const isV2 = (v: unknown): v is string => typeof v === 'string' && v.startsWith(FIELD_PREFIX);

function encodePlain(kind: FieldKind, value: unknown): string {
  return kind === 'text' ? String(value) : JSON.stringify(value);
}

function decodePlain(kind: FieldKind, plain: string): unknown {
  return kind === 'text' ? plain : JSON.parse(plain);
}

export async function encryptValue(table: string, column: string, userId: string, rowId: string, value: unknown): Promise<unknown> {
  const spec = encryptedTable(table)?.columns[column];
  if (!spec) throw new Error(`${table}.${column} is not a registered encrypted column`);
  if (value === null || value === undefined || isV2(value)) return value;
  if (spec === 'text[]') {
    if (!Array.isArray(value)) throw new Error(`${table}.${column} expects text[]`);
    const dek = (await userDek(userId, { create: true }))!;
    return value.map((v, i) => (isV2(v) ? v : encryptField(dek, String(v), `${fieldAad(table, column, rowId)}:${i}`)));
  }
  const dek = (await userDek(userId, { create: true }))!;
  return encryptField(dek, encodePlain(spec, value), fieldAad(table, column, rowId));
}

/** Dual-read: enc:v2 is decrypted; enc:v1 and plaintext pass through untouched (existing readers handle v1). */
export async function decryptValue(table: string, column: string, userId: string, rowId: string, value: unknown): Promise<unknown> {
  const spec = encryptedTable(table)?.columns[column];
  if (!spec) return value;
  if (spec === 'text[]' && Array.isArray(value)) {
    if (!value.some(isV2)) return value;
    const dek = await userDek(userId, { create: false });
    if (!dek) throw new Error('no data key for user');
    return value.map((v, i) => (isV2(v) ? decryptField(dek, v, `${fieldAad(table, column, rowId)}:${i}`) : v));
  }
  if (!isV2(value)) return value;
  const dek = await userDek(userId, { create: false });
  if (!dek) throw new Error('no data key for user');
  return decodePlain(spec, decryptField(dek, value, fieldAad(table, column, rowId)));
}

export class FieldDecryptError extends Error {}

/** Decrypt every registered column present in a row. Needs the row's owner and primary key in the row. */
export async function decryptRow<T extends Record<string, unknown>>(table: string, row: T): Promise<T> {
  const spec = encryptedTable(table);
  if (!spec || !row || typeof row !== 'object') return row;
  const cols = Object.keys(spec.columns).filter((c) => c in row && (isV2(row[c]) || (Array.isArray(row[c]) && (row[c] as unknown[]).some(isV2))));
  if (!cols.length) return row;
  const userId = row[spec.userCol];
  const rowId = rowKeyOf(spec, row);
  if (typeof userId !== 'string' || typeof rowId !== 'string') {
    throw new FieldDecryptError(`${table}: select must include ${keyColumns(spec).join(', ')} to read encrypted columns`);
  }
  const out: Record<string, unknown> = { ...row };
  for (const c of cols) out[c] = await decryptValue(table, c, userId, rowId, row[c]);
  return out as T;
}

export function blindIndexFor(table: string, column: string, value: string): string {
  return blindIndex(derive().indexKey, `${table}.${column}`, value);
}

/**
 * Seals every registered, non-BLOCKED column present in `patch` as enc:v2 for (table, owner, row).
 * Accepts plain values; enc:v1 values are opened first (legacy writers), enc:v2 values are kept.
 */
export async function sealRow<T extends Record<string, unknown>>(table: string, userId: string, rowId: string, patch: T): Promise<T> {
  const spec = encryptedTable(table);
  if (!spec) return patch;
  const out: Record<string, unknown> = { ...patch };
  const { decryptJson, decryptString, isEncrypted } = await import('@/lib/crypto/pii');
  for (const [c, kind] of Object.entries(spec.columns)) {
    if (!(c in out) || isBlocked(table, c)) continue;
    let v = out[c];
    if (v === null || v === undefined || isV2(v)) continue;
    if (Array.isArray(v) && kind === 'text[]') v = v.map((x) => (isEncrypted(x) ? decryptString(x, userId) : x));
    else if (isEncrypted(v)) v = kind === 'text' ? decryptString(v, userId) : decryptJson(v, userId);
    out[c] = await encryptValue(table, c, userId, rowId, v);
  }
  return out as T;
}
