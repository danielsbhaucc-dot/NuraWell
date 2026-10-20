import 'server-only';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { normalizeToOrigin, PUBLIC_APP_URL_DEFAULT } from '@/lib/public-app-url';

/**
 * Passkeys (Face ID / Touch ID / Windows Hello) + one-time backup codes.
 *
 * Security design:
 * - Challenges live ONLY server-side (webauthn_challenges, 3 min, single use). The browser holds an
 *   httpOnly cookie with a random secret; the DB keeps sha256(secret). Consumption is atomic.
 * - Origin + RP ID come from a fixed allowlist (never trusted from the request blindly) and are bound
 *   to the challenge at creation.
 * - User verification (biometric / device PIN) is required for both registration and sign-in.
 * - Signature counter is enforced (clone detection) and updated with compare-and-swap.
 * - A passkey (or backup code) only creates a normal account session. It is NOT an Ops device
 *   credential: synced passkeys roam between devices, so the Ops new-device approval gate in the proxy
 *   and API guards stays fully enforced for admins (no bootstrap: the session is new).
 * - Adding a passkey / regenerating codes needs a fresh sign-in (step-up); for admins it also needs
 *   the current browser to be an approved Ops device.
 */

export const CHALLENGE_COOKIE = 'nw_wa_ch';
export const CHALLENGE_TTL_MS = 3 * 60_000;
export const MAX_PASSKEYS = 10;
export const BACKUP_CODE_COUNT = 10;
export const BACKUP_MAX_FAILS = 5;
export const BACKUP_LOCK_MIN = 30;
export const STEP_UP_MAX_AGE_MS = 15 * 60_000;
export const RP_NAME = 'NuraWell';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const b64u = (b: Uint8Array) => Buffer.from(b).toString('base64url');

export function safeEq(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/* ───────────── origin / RP allowlist ───────────── */
export function allowedOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const set = new Set<string>([PUBLIC_APP_URL_DEFAULT, 'https://nurawell.ai', 'https://www.nurawell.ai']);
  const fromEnv = normalizeToOrigin(env.NEXT_PUBLIC_APP_URL ?? '');
  if (fromEnv) set.add(fromEnv);
  if (env.NODE_ENV !== 'production') {
    set.add('http://localhost:3000');
    set.add('http://localhost:3100');
  }
  return [...set];
}

/** Resolve origin + rpID from the request's Origin header; null if not allowlisted. */
export function resolveRp(req: Request, env: NodeJS.ProcessEnv = process.env): { origin: string; rpID: string } | null {
  const origin = (req.headers.get('origin') ?? '').trim();
  if (!origin || !allowedOrigins(env).includes(origin)) return null;
  return { origin, rpID: new URL(origin).hostname };
}

/* ───────────── challenges ───────────── */
type ChallengeRow = { id: string; user_id: string | null; purpose: 'register' | 'login'; challenge: string; rp_id: string; origin: string };

export async function storeChallenge(
  db: SupabaseClient,
  p: { userId: string | null; purpose: 'register' | 'login'; challenge: string; rpID: string; origin: string },
): Promise<string> {
  const secret = b64u(randomBytes(32));
  const { error } = await db.from('webauthn_challenges').insert({
    binding_hash: sha(secret),
    user_id: p.userId,
    purpose: p.purpose,
    challenge: p.challenge,
    rp_id: p.rpID,
    origin: p.origin,
    expires_at: new Date(Date.now() + CHALLENGE_TTL_MS).toISOString(),
  });
  if (error) throw new Error(`challenge: ${error.message}`);
  return secret;
}

/** Single-use, unexpired, purpose-bound. Atomic: the second caller gets null. */
export async function consumeChallenge(db: SupabaseClient, cookie: string | null | undefined, purpose: 'register' | 'login'): Promise<ChallengeRow | null> {
  if (!cookie || cookie.length < 20 || cookie.length > 100) return null;
  const now = new Date().toISOString();
  const { data } = await db
    .from('webauthn_challenges')
    .update({ consumed_at: now })
    .eq('binding_hash', sha(cookie))
    .eq('purpose', purpose)
    .is('consumed_at', null)
    .gt('expires_at', now)
    .select('id, user_id, purpose, challenge, rp_id, origin');
  const row = (data as ChallengeRow[] | null)?.[0];
  return row ?? null;
}

export const challengeCookieOpts = (path: string) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path,
  maxAge: Math.floor(CHALLENGE_TTL_MS / 1000),
});

/* ───────────── credentials ───────────── */
export type PasskeyRow = {
  id: string;
  user_id: string;
  credential_id: string;
  public_key: string;
  counter: number;
  transports: string[];
  device_type: string;
  backed_up: boolean;
  rp_id: string;
  label: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

export async function listPasskeys(db: SupabaseClient, userId: string) {
  const { data } = await db
    .from('webauthn_credentials')
    .select('id, label, device_type, backed_up, created_at, last_used_at')
    .eq('user_id', userId)
    .is('revoked_at', null)
    .order('created_at', { ascending: false });
  return (data ?? []) as { id: string; label: string; device_type: string; backed_up: boolean; created_at: string; last_used_at: string | null }[];
}

export function passkeyLabel(ua: string | null | undefined): string {
  const u = ua ?? '';
  if (/iPhone|iPad/.test(u)) return 'Face ID · iPhone';
  if (/Mac OS X/.test(u)) return 'Touch ID · Mac';
  if (/Android/.test(u)) return 'טביעת אצבע · Android';
  if (/Windows/.test(u)) return 'Windows Hello';
  return 'מפתח גישה';
}

export async function registrationOptions(
  db: SupabaseClient,
  user: { id: string; email: string },
  rp: { origin: string; rpID: string },
) {
  const existing = await db.from('webauthn_credentials').select('credential_id, transports').eq('user_id', user.id).is('revoked_at', null);
  const rows = (existing.data ?? []) as { credential_id: string; transports: string[] }[];
  if (rows.length >= MAX_PASSKEYS) return { error: 'limit' as const };
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: rp.rpID,
    userName: user.email,
    userDisplayName: user.email,
    // opaque, stable handle (never the email / db id in clear)
    userID: new Uint8Array(createHash('sha256').update(`nw-passkey:${user.id}`).digest()),
    attestationType: 'none',
    excludeCredentials: rows.map((r) => ({ id: r.credential_id, transports: r.transports as never })),
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    timeout: CHALLENGE_TTL_MS,
  });
  const secret = await storeChallenge(db, { userId: user.id, purpose: 'register', challenge: options.challenge, ...rp });
  return { options, secret };
}

export async function verifyRegistration(
  db: SupabaseClient,
  userId: string,
  ch: ChallengeRow | null,
  response: RegistrationResponseJSON,
  meta: { label: string; opsDeviceId: string | null },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!ch || ch.user_id !== userId) return { ok: false, error: 'expired' };
  let v;
  try {
    v = await verifyRegistrationResponse({
      response,
      expectedChallenge: ch.challenge,
      expectedOrigin: ch.origin,
      expectedRPID: ch.rp_id,
      requireUserVerification: true,
    });
  } catch {
    return { ok: false, error: 'invalid' };
  }
  if (!v.verified || !v.registrationInfo.userVerified) return { ok: false, error: 'invalid' };
  const { credential, credentialDeviceType, credentialBackedUp } = v.registrationInfo;
  const { data, error } = await db
    .from('webauthn_credentials')
    .insert({
      user_id: userId,
      credential_id: credential.id,
      public_key: b64u(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports ?? [],
      device_type: credentialDeviceType,
      backed_up: credentialBackedUp,
      rp_id: ch.rp_id,
      label: meta.label.slice(0, 60),
      ops_device_id: meta.opsDeviceId,
    })
    .select('id')
    .single();
  if (error || !data) return { ok: false, error: 'duplicate' };
  await audit(db, userId, 'passkey_registered', { rp: ch.rp_id, device_type: credentialDeviceType });
  return { ok: true, id: (data as { id: string }).id };
}

export async function authenticationOptions(db: SupabaseClient, rp: { origin: string; rpID: string }) {
  const options = await generateAuthenticationOptions({
    rpID: rp.rpID,
    userVerification: 'required',
    allowCredentials: [], // discoverable credentials: no account enumeration
    timeout: CHALLENGE_TTL_MS,
  });
  const secret = await storeChallenge(db, { userId: null, purpose: 'login', challenge: options.challenge, ...rp });
  return { options, secret };
}

export async function verifyAuthentication(
  db: SupabaseClient,
  ch: ChallengeRow | null,
  response: AuthenticationResponseJSON,
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  if (!ch) return { ok: false, error: 'expired' };
  if (typeof response?.id !== 'string' || response.id.length > 1024) return { ok: false, error: 'invalid' };
  const { data } = await db
    .from('webauthn_credentials')
    .select('id, user_id, credential_id, public_key, counter, transports, rp_id, revoked_at')
    .eq('credential_id', response.id)
    .maybeSingle();
  const cred = data as PasskeyRow | null;
  if (!cred || cred.revoked_at || cred.rp_id !== ch.rp_id) return { ok: false, error: 'unknown' };
  let v;
  try {
    v = await verifyAuthenticationResponse({
      response,
      expectedChallenge: ch.challenge,
      expectedOrigin: ch.origin,
      expectedRPID: ch.rp_id,
      requireUserVerification: true,
      credential: {
        id: cred.credential_id,
        publicKey: new Uint8Array(Buffer.from(cred.public_key, 'base64url')),
        counter: Number(cred.counter),
        transports: cred.transports as never,
      },
    });
  } catch {
    await audit(db, cred.user_id, 'passkey_login_failed', { reason: 'verify' });
    return { ok: false, error: 'invalid' };
  }
  if (!v.verified || !v.authenticationInfo.userVerified) return { ok: false, error: 'invalid' };
  const next = v.authenticationInfo.newCounter;
  // compare-and-swap on the counter: a concurrent replay with the same counter loses
  const { data: upd } = await db
    .from('webauthn_credentials')
    .update({ counter: next, last_used_at: new Date().toISOString() })
    .eq('id', cred.id)
    .eq('counter', cred.counter)
    .is('revoked_at', null)
    .select('id');
  if (!upd?.length) return { ok: false, error: 'invalid' };
  await audit(db, cred.user_id, 'passkey_login', { credential: cred.id });
  return { ok: true, userId: cred.user_id };
}

export async function revokePasskey(db: SupabaseClient, userId: string, id: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return false;
  const { data } = await db
    .from('webauthn_credentials')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)
    .is('revoked_at', null)
    .select('id');
  if (data?.length) await audit(db, userId, 'passkey_revoked', { credential: id });
  return Boolean(data?.length);
}

/* ───────────── backup codes ───────────── */
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newBackupCode(): string {
  let s = '';
  for (let i = 0; i < 10; i++) s += ALPHA[randomInt(ALPHA.length)];
  return `${s.slice(0, 5)}-${s.slice(5)}`;
}
export const normalizeBackupCode = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Replaces every code. Plaintext is returned ONCE and never stored (bcrypt in DB). */
export async function regenerateBackupCodes(db: SupabaseClient, userId: string): Promise<string[]> {
  const codes = Array.from({ length: BACKUP_CODE_COUNT }, newBackupCode);
  const { error } = await db.rpc('user_set_backup_codes', { p_user: userId, p_codes: codes });
  if (error) throw new Error('backup codes');
  await audit(db, userId, 'backup_codes_generated', { count: codes.length });
  return codes;
}

export async function backupCodesLeft(db: SupabaseClient, userId: string): Promise<number> {
  const { count } = await db.from('user_backup_codes').select('id', { count: 'exact', head: true }).eq('user_id', userId).is('used_at', null);
  return count ?? 0;
}

/** Use one code (single use, DB lockout after 5 failures for 30 min). */
export async function redeemBackupCode(db: SupabaseClient, userId: string, code: string): Promise<{ ok: true } | { ok: false; locked?: boolean }> {
  const { data: st } = await db.from('user_auth_factor_state').select('backup_failures, backup_locked_until').eq('user_id', userId).maybeSingle();
  const s = st as { backup_failures: number; backup_locked_until: string | null } | null;
  if (s?.backup_locked_until && Date.parse(s.backup_locked_until) > Date.now()) return { ok: false, locked: true };
  const clean = normalizeBackupCode(typeof code === 'string' ? code : '');
  const { data: hit } = clean.length === 10 ? await db.rpc('user_use_backup_code', { p_user: userId, p_code: clean }) : { data: false };
  if (hit !== true) {
    const fails = (s?.backup_failures ?? 0) + 1;
    const lock = fails >= BACKUP_MAX_FAILS;
    await db.from('user_auth_factor_state').upsert({
      user_id: userId,
      backup_failures: lock ? 0 : fails,
      backup_locked_until: lock ? new Date(Date.now() + BACKUP_LOCK_MIN * 60_000).toISOString() : null,
      updated_at: new Date().toISOString(),
    });
    await audit(db, userId, lock ? 'backup_code_locked' : 'backup_code_failed', { fails });
    return { ok: false, locked: lock };
  }
  await db.from('user_auth_factor_state').upsert({ user_id: userId, backup_failures: 0, backup_locked_until: null, updated_at: new Date().toISOString() });
  await audit(db, userId, 'backup_code_used', {});
  return { ok: true };
}

/* ───────────── step-up ───────────── */
/**
 * Sensitive changes need a session whose most recent authentication (JWT `amr`, per session, not
 * per user) happened within the last 15 minutes.
 */
export function isFreshSession(accessToken: string | null | undefined, now = Date.now()): boolean {
  if (!accessToken) return false;
  try {
    const payload = JSON.parse(Buffer.from(accessToken.split('.')[1] ?? '', 'base64url').toString('utf8')) as { amr?: { timestamp?: number }[] };
    const latest = Math.max(0, ...(payload.amr ?? []).map((a) => Number(a?.timestamp) || 0)) * 1000;
    return latest > 0 && now - latest <= STEP_UP_MAX_AGE_MS && latest <= now + 60_000;
  } catch {
    return false;
  }
}

export async function audit(db: SupabaseClient, userId: string, event: string, detail: Record<string, unknown> = {}) {
  await db
    .from('admin_audit_log')
    .insert({ actor_id: userId, method: 'SECURITY', path: event, detail })
    .then(() => undefined, () => undefined);
}
