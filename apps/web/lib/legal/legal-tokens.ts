import 'server-only';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Guard for the two provider tokens of the "אני צריך ראיה" button:
 *   LEGAL_LOGS_VERCEL_TOKEN   (Vercel, team-scoped, no expiry)
 *   LEGAL_LOGS_SUPABASE_TOKEN (Supabase Management API, no expiry)
 * Neither token is read-only at the provider, so the app enforces the limits itself:
 *  - the ONLY way to read them is legalToken() inside runEvidenceRequest(), which the platform-logs
 *    route opens after admin + Ops sensitive step-up;
 *  - every use writes an append-only legal_access_log row (who, when, which user, which provider);
 *  - any read outside an evidence request returns null, is logged as legal_token_misuse and alerts
 *    the owner via Gideon (Telegram + email).
 *
 * KMS: both names are in ENVELOPE_KEY_NAMES (lib/security/kms-envelope.ts), so once the KMS rollout
 * sets KMS_WRAPPED_LEGAL_LOGS_* and KMS_ENVELOPE_MODE, they are unwrapped exactly like the master keys
 * and the plain env vars can be removed. With the flag off nothing changes.
 */
export type LegalProvider = 'vercel' | 'supabase';
const VAR: Record<LegalProvider, string> = { vercel: 'LEGAL_LOGS_VERCEL_TOKEN', supabase: 'LEGAL_LOGS_SUPABASE_TOKEN' };

export type EvidenceCtx = { db: SupabaseClient; actorId: string; subjectUserId: string; evidenceId: string; stepUp: boolean };
const als = new AsyncLocalStorage<EvidenceCtx>();

type Alert = (db: SupabaseClient | null, text: string) => Promise<void>;
const defaultAlert: Alert = async (db, text) => {
  if (!db) return;
  const { alertOwnerSecurity } = await import('@/lib/ops/device-notify');
  await alertOwnerSecurity(db, null, text, 'שימוש חריג במפתח יומני ספק');
};
let alertFn: Alert = defaultAlert;
let fallbackDb: (() => SupabaseClient | null) = () => {
  try {
    return (require('@/lib/supabase/admin') as { createAdminClient: () => SupabaseClient }).createAdminClient();
  } catch { return null; }
};
export function __setLegalTokenHooks(h: { alert?: Alert | null; db?: (() => SupabaseClient | null) | null }) {
  if (h.alert !== undefined) alertFn = h.alert ?? defaultAlert;
  if (h.db !== undefined && h.db) fallbackDb = h.db;
}

async function audit(db: SupabaseClient | null, row: { actor_id: string | null; action: string; user_id: string | null; detail: Record<string, unknown> }) {
  if (!db) return;
  await db.from('legal_access_log').insert(row).then(() => undefined, () => undefined);
}

export function runEvidenceRequest<T>(ctx: EvidenceCtx, fn: () => Promise<T>): Promise<T> {
  if (!ctx.stepUp) return Promise.reject(new Error('legal_tokens_require_stepup'));
  return als.run(ctx, fn);
}

export const legalTokenConfigured = (p: LegalProvider) => !!process.env[VAR[p]]?.trim();

/** Returns the token only inside an evidence request; otherwise null + misuse audit + owner alert. */
export async function legalToken(p: LegalProvider, where: string): Promise<string | null> {
  try { (await import('@/lib/security/kms-envelope')).ensureKmsKeysSync(); } catch { /* plain env fallback */ }
  const token = process.env[VAR[p]]?.trim() || null;
  if (!token) return null;
  const ctx = als.getStore();
  const at = new Date().toISOString();
  if (!ctx || !ctx.stepUp) {
    const db = fallbackDb();
    await audit(db, { actor_id: null, action: 'legal_token_misuse', user_id: null, detail: { provider: p, where, at } });
    await alertFn(db, `⚠️ מפתח יומני הספק (${p}) נקרא מחוץ לבקשת "אני צריך ראיה".\nמקום: ${where}\nזמן: ${at}\nהגישה נחסמה. אם זה לא אתה, בטל את המפתח בלוח הבקרה של הספק.`).catch(() => undefined);
    return null;
  }
  await audit(ctx.db, { actor_id: ctx.actorId, action: 'legal_token_used', user_id: ctx.subjectUserId, detail: { provider: p, where, evidence_id: ctx.evidenceId, at } });
  return token;
}
