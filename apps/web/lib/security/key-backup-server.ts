import 'server-only';
import { createHash, hkdfSync, randomBytes } from 'node:crypto';
import { encodeShare, sealBackup, splitSecret } from '@/lib/crypto/key-backup';

export const BACKUP_KEY_NAMES = ['PII_ENCRYPTION_KEY', 'SECURE_VAULT_KEY', 'GIDEON_SETTINGS_KEY', 'CONSENT_SIGNING_PRIVATE_KEY', 'DB_BACKUP_AGE_IDENTITY'] as const;

const fp = (v: string) => createHash('sha256').update(v).digest('hex').slice(0, 12);

/**
 * Collects key VALUES from env. GIDEON_SETTINGS_KEY: if not set explicitly, the effective key is
 * derived from the service-role key; we back up that derived value under GIDEON_SETTINGS_KEY so a
 * restore sets it explicitly and Gideon secrets survive any service-role rotation.
 */
function collect(env: NodeJS.ProcessEnv = process.env): { keys: Record<string, string>; gideonDerived: boolean } {
  const keys: Record<string, string> = {};
  for (const n of BACKUP_KEY_NAMES) {
    const v = env[n]?.trim();
    if (v) keys[n] = v;
  }
  let gideonDerived = false;
  if (!keys.GIDEON_SETTINGS_KEY && env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    keys.GIDEON_SETTINGS_KEY = Buffer.from(hkdfSync('sha256', env.SUPABASE_SERVICE_ROLE_KEY.trim(), 'nurawell-gideon-settings', 'v1', 32)).toString('base64');
    gideonDerived = true;
  }
  return { keys, gideonDerived };
}

export type BackupBundle = {
  sealed: string;
  recovery: string;
  shares: [string, string, string];
  inventory: { name: string; fingerprint: string }[];
  gideonDerived: boolean;
  createdAt: string;
};

/** Returns only ciphertext + shares. Plain values never leave this function and are never logged. */
export const AGE_IDENTITY_RE = /^AGE-SECRET-KEY-1[0-9A-Z]{58}$/;

/** `extra`: optional secrets supplied by the owner at backup time (e.g. the DB-backup age identity, never stored server-side). */
export function buildKeyBackup(passphrase: string, env: NodeJS.ProcessEnv = process.env, extra: Record<string, string> = {}): BackupBundle {
  const { keys, gideonDerived } = collect(env);
  if (extra.DB_BACKUP_AGE_IDENTITY && AGE_IDENTITY_RE.test(extra.DB_BACKUP_AGE_IDENTITY)) keys.DB_BACKUP_AGE_IDENTITY = extra.DB_BACKUP_AGE_IDENTITY;
  if (!Object.keys(keys).length) throw new Error('no_keys');
  const recoveryKey = randomBytes(32);
  try {
    const sealed = sealBackup(keys, passphrase);
    const recovery = sealBackup(keys, recoveryKey.toString('base64url'));
    const s = splitSecret(recoveryKey, 3, 2).map((x) => encodeShare(x));
    return {
      sealed,
      recovery,
      shares: [s[0], s[1], s[2]],
      inventory: Object.entries(keys).map(([name, v]) => ({ name, fingerprint: fp(v) })),
      gideonDerived,
      createdAt: new Date().toISOString(),
    };
  } finally {
    recoveryKey.fill(0);
    for (const k of Object.keys(keys)) keys[k] = '';
  }
}

/** Rough strength score 0-4 mirrored on the client meter; server enforces >= 3 and >= 16 chars. */
export function passphraseScore(p: string): number {
  if (p.length < 16) return Math.min(2, Math.floor(p.length / 6));
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^\w\s]/, /[\u0590-\u05FF]/, /\s/].filter((r) => r.test(p)).length;
  const uniq = new Set(p).size;
  let s = 2;
  if (p.length >= 20) s++;
  if (classes >= 2 && uniq >= 10) s++;
  if (/(.)\1{3,}/.test(p) || uniq < 6) s = 1;
  return Math.min(4, s);
}
