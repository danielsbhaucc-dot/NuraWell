/**
 * הצפנת שדות רגישים ברמת האפליקציה (AES-256-GCM), כך שב-DB נשמר ciphertext בלבד.
 * מפתח: PII_ENCRYPTION_KEY (32 בייט, base64 או hex) ב-Vercel env. לשרת בלבד.
 * פורמט: "enc:v1:<iv>.<tag>.<ciphertext>" (base64url). AAD = userId, כך ששורה לא ניתנת להעברה בין משתמשים.
 * קריאה תואמת לאחור: ערך שאינו מוצפן מוחזר כמו שהוא (שורות ישנות לפני המיגרציה).
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { ensureKmsKeysSync } from '@/lib/security/kms-envelope';

const PREFIX = 'enc:v1:';

let cachedKey: Buffer | null = null;
function key(): Buffer {
  if (cachedKey) return cachedKey;
  ensureKmsKeysSync();
  const raw = process.env.PII_ENCRYPTION_KEY?.trim();
  if (!raw) throw new Error('PII_ENCRYPTION_KEY missing');
  const k = Buffer.from(raw, raw.length === 64 && /^[0-9a-f]+$/i.test(raw) ? 'hex' : 'base64');
  if (k.length !== 32) throw new Error('PII_ENCRYPTION_KEY must be 32 bytes');
  cachedKey = k;
  return k;
}

/** לבדיקות בלבד */
export function __resetPiiKeyCache(): void {
  cachedKey = null;
}

export function isEncrypted(v: unknown): v is string {
  return typeof v === 'string' && v.startsWith(PREFIX);
}

export function encryptString(plain: string, userId: string): string {
  // never wrap a per-user field-envelope value (enc:v2) in the legacy key
  if (plain.startsWith('enc:v2:')) return plain;
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  c.setAAD(Buffer.from(userId));
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return `${PREFIX}${iv.toString('base64url')}.${c.getAuthTag().toString('base64url')}.${ct.toString('base64url')}`;
}

export function decryptString(value: string, userId: string): string {
  if (!isEncrypted(value)) return value;
  const [iv, tag, ct] = value.slice(PREFIX.length).split('.');
  if (!iv || !tag || ct === undefined) throw new Error('PII ciphertext malformed');
  const t = Buffer.from(tag, 'base64url');
  // GCM accepts truncated tags unless the length is pinned; a 4-byte tag would be forgeable by brute force.
  if (t.length !== 16) throw new Error('PII ciphertext malformed');
  const d = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'), { authTagLength: 16 });
  d.setAAD(Buffer.from(userId));
  d.setAuthTag(t);
  return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8');
}

/** מצפין ערך JSON כלשהו למחרוזת (נשמרת כ-jsonb string). null/undefined נשארים. */
export function encryptJson(value: unknown, userId: string): string | null | undefined {
  if (value === null || value === undefined) return value as null | undefined;
  if (isEncrypted(value) || (typeof value === 'string' && value.startsWith('enc:v2:'))) return value;
  return encryptString(JSON.stringify(value), userId);
}

/** מפענח ערך שנשמר ב-encryptJson; ערך לא מוצפן (ישן) חוזר כמו שהוא. */
export function decryptJson<T = unknown>(value: unknown, userId: string): T {
  if (!isEncrypted(value)) return value as T;
  return JSON.parse(decryptString(value, userId)) as T;
}

/** מערך מחרוזות: כל פריט מוצפן בנפרד (עמודת text[]). */
export function encryptStringArray(values: string[] | null | undefined, userId: string): string[] {
  return (values ?? []).map((v) => (isEncrypted(v) ? v : encryptString(v, userId)));
}

export function decryptStringArray(values: unknown, userId: string): string[] {
  if (!Array.isArray(values)) return [];
  return values.map((v) => (typeof v === 'string' ? decryptString(v, userId) : String(v)));
}

/** עמודות jsonb מוצפנות ב-user_memory_dossier */
export const DOSSIER_ENCRYPTED_FIELDS = ['health_context', 'psychology', 'risk_signals', 'personal_context'] as const;

export function decryptDossierRow<T extends Record<string, unknown> | null>(row: T, userId: string): T {
  if (!row) return row;
  const out: Record<string, unknown> = { ...row };
  for (const f of DOSSIER_ENCRYPTED_FIELDS) {
    if (f in out) out[f] = decryptJson(out[f], userId);
  }
  return out as T;
}
