import 'server-only';
import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

/**
 * Gideon settings (admin /ops/ceo/settings). Single row public.gideon_settings, service-role only.
 * Secrets (Telegram bot token, webhook secret) are AES-256-GCM encrypted at rest; the key never lives
 * in the DB: GIDEON_SETTINGS_KEY (base64, 32 bytes) or, if unset, HKDF of SUPABASE_SERVICE_ROLE_KEY.
 * Secrets are write-only from the UI: reads return only a masked hint ("••••1a2b").
 */

export const AlertTopics = z.object({
  daily: z.boolean().default(true),
  weekly: z.boolean().default(true),
  monthly: z.boolean().default(true),
  cost: z.boolean().default(true),
  owner_tasks: z.boolean().default(true),
});
export const Recipient = z.object({ chat_id: z.string().regex(/^-?\d{3,20}$/), label: z.string().max(60).default('') });

export const GideonSettingsInput = z.object({
  cost_ratio_threshold: z.number().min(1.1).max(20),
  cost_min_delta_usd: z.number().min(0).max(1000),
  cost_per_user_min_delta_usd: z.number().min(0).max(100),
  cost_max_single_user_share: z.number().min(0.05).max(1),
  digest_enabled: z.boolean(),
  digest_hour: z.number().int().min(0).max(23),
  alert_topics: AlertTopics,
  recipients: z.array(Recipient).max(20),
  /** write-only. undefined = keep, '' = clear, value = replace */
  telegram_bot_token: z.string().regex(/^\d{5,15}:[A-Za-z0-9_-]{30,60}$/, 'פורמט טוקן בוט לא תקין').or(z.literal('')).optional(),
  telegram_webhook_secret: z.string().regex(/^[A-Za-z0-9_-]{16,256}$/, 'סוד webhook: 16-256 תווים A-Z a-z 0-9 _ -').or(z.literal('')).optional(),
});
export type GideonSettingsInput = z.infer<typeof GideonSettingsInput>;

export type GideonSettings = Omit<GideonSettingsInput, 'telegram_bot_token' | 'telegram_webhook_secret'> & {
  telegram_bot_token_hint: string | null;
  telegram_webhook_secret_hint: string | null;
  updated_at: string | null;
};

export const DEFAULT_GIDEON_SETTINGS: GideonSettings = {
  cost_ratio_threshold: 2.5,
  cost_min_delta_usd: 0.25,
  cost_per_user_min_delta_usd: 0.02,
  cost_max_single_user_share: 0.6,
  digest_enabled: true,
  digest_hour: 21,
  alert_topics: AlertTopics.parse({}),
  recipients: [],
  telegram_bot_token_hint: null,
  telegram_webhook_secret_hint: null,
  updated_at: null,
};

function explicitKey(): Buffer | null {
  const explicit = process.env.GIDEON_SETTINGS_KEY?.trim();
  if (!explicit) return null;
  const k = Buffer.from(explicit, 'base64');
  return k.length === 32 ? k : null;
}

function legacyKey(): Buffer | null {
  const base = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return base ? Buffer.from(hkdfSync('sha256', base, 'nurawell-gideon-settings', 'v1', 32)) : null;
}

function key(): Buffer {
  const k = explicitKey() ?? legacyKey();
  if (!k) throw new Error('no encryption key (GIDEON_SETTINGS_KEY / SUPABASE_SERVICE_ROLE_KEY)');
  return k;
}

export function encryptSecret(plain: string, k: Buffer = key()): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', k, iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return `v1:${iv.toString('base64')}:${c.getAuthTag().toString('base64')}:${enc.toString('base64')}`;
}

function decryptWith(blob: string, k: Buffer): string {
  const [v, iv, tag, data] = blob.split(':');
  if (v !== 'v1' || !iv || !tag || !data) throw new Error('bad secret blob');
  const d = createDecipheriv('aes-256-gcm', k, Buffer.from(iv, 'base64'), { authTagLength: 16 });
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8');
}

/** Explicit key first, then the legacy service-role derivation (so a migration never strands secrets). */
export function decryptSecret(blob: string, k?: Buffer): string {
  if (k) return decryptWith(blob, k);
  const keys = [explicitKey(), legacyKey()].filter((x): x is Buffer => !!x);
  let last: unknown = new Error('no encryption key');
  for (const kk of keys) {
    try {
      return decryptWith(blob, kk);
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

/**
 * Re-encrypts stored Gideon secrets under the dedicated GIDEON_SETTINGS_KEY (no-op when unset or
 * already migrated). After this, rotating the service-role key no longer affects Gideon secrets.
 */
export async function migrateGideonSecrets(db: SupabaseClient): Promise<{ migrated: number; skipped: boolean }> {
  const ek = explicitKey();
  if (!ek) return { migrated: 0, skipped: true };
  const r = await readRow(db);
  if (!r) return { migrated: 0, skipped: false };
  const patch: Record<string, unknown> = {};
  for (const col of ['telegram_bot_token_enc', 'telegram_webhook_secret_enc'] as const) {
    const blob = r[col];
    if (typeof blob !== 'string' || !blob) continue;
    try {
      decryptWith(blob, ek);
      continue; // already on the dedicated key
    } catch {
      /* needs migration */
    }
    try {
      patch[col] = encryptSecret(decryptSecret(blob), ek);
    } catch {
      /* undecryptable: leave untouched */
    }
  }
  const n = Object.keys(patch).length;
  if (n) {
    await db.from('gideon_settings').update(patch).eq('id', 1);
    invalidateSecretCache();
  }
  return { migrated: n, skipped: false };
}

export function maskSecret(plain: string | null): string | null {
  if (!plain) return null;
  return `••••${plain.slice(-4)}`;
}

type Row = Record<string, unknown> & { telegram_bot_token_enc?: string | null; telegram_webhook_secret_enc?: string | null };

async function readRow(db: SupabaseClient): Promise<Row | null> {
  const { data, error } = await db.from('gideon_settings').select('*').eq('id', 1).maybeSingle();
  if (error) return null; // table missing before migration → defaults
  return (data as Row | null) ?? null;
}

function safeDecrypt(blob: unknown): string | null {
  if (typeof blob !== 'string' || !blob) return null;
  try {
    return decryptSecret(blob);
  } catch {
    return null;
  }
}

export async function readGideonSettings(db: SupabaseClient): Promise<GideonSettings> {
  const r = await readRow(db);
  if (!r) return DEFAULT_GIDEON_SETTINGS;
  const num = (v: unknown, d: number) => (v == null || Number.isNaN(Number(v)) ? d : Number(v));
  return {
    cost_ratio_threshold: num(r.cost_ratio_threshold, 2.5),
    cost_min_delta_usd: num(r.cost_min_delta_usd, 0.25),
    cost_per_user_min_delta_usd: num(r.cost_per_user_min_delta_usd, 0.02),
    cost_max_single_user_share: num(r.cost_max_single_user_share, 0.6),
    digest_enabled: r.digest_enabled !== false,
    digest_hour: num(r.digest_hour, 21),
    alert_topics: AlertTopics.parse(r.alert_topics ?? {}),
    recipients: z.array(Recipient).catch([]).parse(r.recipients ?? []),
    telegram_bot_token_hint: maskSecret(safeDecrypt(r.telegram_bot_token_enc)),
    telegram_webhook_secret_hint: maskSecret(safeDecrypt(r.telegram_webhook_secret_enc)),
    updated_at: (r.updated_at as string) ?? null,
  };
}

export async function writeGideonSettings(db: SupabaseClient, input: GideonSettingsInput, adminId: string | null): Promise<{ ok: boolean; error?: string }> {
  const { telegram_bot_token, telegram_webhook_secret, ...rest } = input;
  const patch: Record<string, unknown> = { ...rest, id: 1, updated_at: new Date().toISOString(), updated_by: adminId };
  if (telegram_bot_token !== undefined) patch.telegram_bot_token_enc = telegram_bot_token ? encryptSecret(telegram_bot_token) : null;
  if (telegram_webhook_secret !== undefined) patch.telegram_webhook_secret_enc = telegram_webhook_secret ? encryptSecret(telegram_webhook_secret) : null;
  const { error } = await db.from('gideon_settings').upsert(patch, { onConflict: 'id' });
  invalidateSecretCache();
  return error ? { ok: false, error: error.message } : { ok: true };
}

/* ---- runtime secret lookup (DB override → env), cached 60s per instance ---- */
let cache: { at: number; token: string | null; webhook: string | null } | null = null;
export function invalidateSecretCache() {
  cache = null;
}
export async function gideonSecrets(db: SupabaseClient): Promise<{ token: string | null; webhook: string | null }> {
  if (cache && Date.now() - cache.at < 60_000) return cache;
  const r = await readRow(db).catch(() => null);
  cache = {
    at: Date.now(),
    token: safeDecrypt(r?.telegram_bot_token_enc) ?? (process.env.TELEGRAM_BOT_TOKEN?.trim() || null),
    webhook: safeDecrypt(r?.telegram_webhook_secret_enc) ?? (process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || null),
  };
  return cache;
}

/** Outbound recipients = env allowlist ∪ admin-added recipients (outbound only; inbound commands stay env-gated). */
export function digestRecipients(settings: Pick<GideonSettings, 'recipients'>, envIds: Iterable<string>): string[] {
  return [...new Set([...envIds, ...settings.recipients.map((r) => r.chat_id)])];
}

export function fingerprint(s: string): string {
  return createHash('sha256').update(s).digest('hex').slice(0, 8);
}
