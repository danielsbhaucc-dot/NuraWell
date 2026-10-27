import 'server-only';
import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse,
  type AuthenticationResponseJSON, type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { consumeChallenge, storeChallenge, RP_NAME } from '@/lib/module-api/auth-signup/lib-auth-passkeys';
import { acceptAdminKey, adminKeyRegistrationPolicy, ADMIN_KEY_TIMEOUT_MS, counterOk, keyLimitReached } from '@/lib/security-core/webauthn-policy';
import { audit, consumeApproved, decideRequest, type LoginRequest } from './device-trust';

/**
 * Hardware security keys for Ops (admin) login. A tap approves the pending new-device request of the key's owner,
 * exactly like a one-time recovery code does. Registering needs an already-approved device + step-up; removing a key
 * needs step-up + a recovery code (it loosens security). Challenges: passkey_challenges, single use, user-bound.
 */
export const KEY_CHALLENGE_COOKIE = 'nw_ops_key_ch';
const b64u = (b: Uint8Array) => Buffer.from(b).toString('base64url');
type KeyRow = { id: string; user_id: string; credential_id: string; public_key: string; counter: number; transports: string[]; revoked_at: string | null };

export async function listKeys(db: SupabaseClient, userId: string) {
  const { data } = await db.from('ops_security_keys').select('id, label, created_at, last_used_at').eq('user_id', userId).is('revoked_at', null).order('created_at');
  return (data ?? []) as { id: string; label: string; created_at: string; last_used_at: string | null }[];
}
async function activeCreds(db: SupabaseClient, userId: string) {
  const { data } = await db.from('ops_security_keys').select('credential_id, transports').eq('user_id', userId).is('revoked_at', null);
  return (data ?? []) as { credential_id: string; transports: string[] }[];
}

export async function keyRegistrationOptions(db: SupabaseClient, user: { id: string; email: string }, rp: { origin: string; rpID: string }) {
  const rows = await activeCreds(db, user.id);
  if (keyLimitReached(rows.length)) return { error: 'limit' as const };
  const pol = adminKeyRegistrationPolicy();
  const options = await generateRegistrationOptions({
    rpName: `${RP_NAME} Ops`, rpID: rp.rpID, userName: user.email, userDisplayName: user.email,
    userID: new Uint8Array(createHash('sha256').update(`ops-key:${user.id}`).digest()),
    attestationType: pol.attestationType, authenticatorSelection: pol.authenticatorSelection, timeout: pol.timeout,
    excludeCredentials: rows.map((r) => ({ id: r.credential_id, transports: r.transports as never })),
  });
  const secret = await storeChallenge(db, { userId: user.id, purpose: 'register', challenge: options.challenge, ...rp });
  return { options, secret };
}

export async function verifyKeyRegistration(db: SupabaseClient, userId: string, cookie: string | null, response: RegistrationResponseJSON, label: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const ch = await consumeChallenge(db, cookie, 'register');
  if (!ch || ch.user_id !== userId) return { ok: false, error: 'פג תוקף. נסו שוב.' };
  let v;
  try { v = await verifyRegistrationResponse({ response, expectedChallenge: ch.challenge, expectedOrigin: ch.origin, expectedRPID: ch.rp_id, requireUserVerification: true }); }
  catch { return { ok: false, error: 'המפתח לא אומת.' }; }
  if (!v.verified) return { ok: false, error: 'המפתח לא אומת.' };
  const { credential, credentialDeviceType, credentialBackedUp, userVerified, aaguid } = v.registrationInfo;
  const acc = acceptAdminKey({ credentialDeviceType, credentialBackedUp, userVerified });
  if (!acc.ok) {
    await audit(db, userId, 'ops_key_rejected', { reason: acc.reason });
    return { ok: false, error: acc.reason === 'synced' ? 'זה מפתח גישה מסונכרן (למשל בטלפון או בחשבון ענן). כאן צריך מפתח אבטחה פיזי.' : 'המפתח חייב לבקש קוד PIN או מגע.' };
  }
  const { error } = await db.from('ops_security_keys').insert({ user_id: userId, credential_id: credential.id, public_key: b64u(credential.publicKey), counter: credential.counter, transports: credential.transports ?? [], aaguid: aaguid ?? null, label: (label || 'מפתח אבטחה').slice(0, 60) });
  if (error) return { ok: false, error: 'המפתח כבר רשום.' };
  await audit(db, userId, 'ops_key_registered', { label: label.slice(0, 60) });
  return { ok: true };
}

/** Options for the waiting browser: only this user's keys are allowed (no discoverable lookup). */
export async function keyLoginOptions(db: SupabaseClient, userId: string, rp: { origin: string; rpID: string }) {
  const rows = await activeCreds(db, userId);
  if (!rows.length) return { error: 'none' as const };
  const options = await generateAuthenticationOptions({ rpID: rp.rpID, userVerification: 'required', timeout: ADMIN_KEY_TIMEOUT_MS, allowCredentials: rows.map((r) => ({ id: r.credential_id, transports: r.transports as never })) });
  const secret = await storeChallenge(db, { userId, purpose: 'login', challenge: options.challenge, ...rp });
  return { options, secret };
}

/** Tap → approve the pending device request (same effect as a recovery code). */
export async function redeemKeyTap(db: SupabaseClient, r: LoginRequest, cookie: string | null, response: AuthenticationResponseJSON): Promise<{ ok: true; cookie: string } | { ok: false; error: string }> {
  const uid = r.user_id;
  const ch = await consumeChallenge(db, cookie, 'login');
  if (!ch || ch.user_id !== uid) return { ok: false, error: 'פג תוקף. נסו שוב.' };
  if (typeof response?.id !== 'string' || response.id.length > 1400) return { ok: false, error: 'המפתח לא אומת.' };
  const { data } = await db.from('ops_security_keys').select('id, user_id, credential_id, public_key, counter, transports, revoked_at').eq('credential_id', response.id).maybeSingle();
  const k = data as KeyRow | null;
  if (!k || k.revoked_at || k.user_id !== uid) { await audit(db, uid, 'ops_key_failed', { reason: 'unknown' }); return { ok: false, error: 'המפתח לא רשום לחשבון הזה.' }; }
  let v;
  try {
    v = await verifyAuthenticationResponse({ response, expectedChallenge: ch.challenge, expectedOrigin: ch.origin, expectedRPID: ch.rp_id, requireUserVerification: true,
      credential: { id: k.credential_id, publicKey: new Uint8Array(Buffer.from(k.public_key, 'base64url')), counter: Number(k.counter), transports: k.transports as never } });
  } catch { await audit(db, uid, 'ops_key_failed', { reason: 'verify' }); return { ok: false, error: 'המפתח לא אומת.' }; }
  if (!v.verified || !v.authenticationInfo.userVerified || !counterOk(Number(k.counter), v.authenticationInfo.newCounter)) {
    await audit(db, uid, 'ops_key_failed', { reason: 'counter_or_uv' });
    return { ok: false, error: 'המפתח לא אומת.' };
  }
  const { data: upd } = await db.from('ops_security_keys').update({ counter: v.authenticationInfo.newCounter, last_used_at: new Date().toISOString() }).eq('id', k.id).eq('counter', k.counter).is('revoked_at', null).select('id');
  if (!upd?.length) return { ok: false, error: 'המפתח לא אומת.' };
  const d = await decideRequest(db, r.id, true, 'security_key');
  if (!d) return { ok: false, error: 'הבקשה פגה. התחברו מחדש.' };
  const c = await consumeApproved(db, d);
  if (!c) return { ok: false, error: 'לא הצלחתי לסיים את האישור.' };
  await audit(db, uid, 'ops_key_used', { key: k.id, request: r.id });
  return { ok: true, cookie: c };
}

export async function removeKey(db: SupabaseClient, userId: string, id: string): Promise<boolean> {
  const { data } = await db.from('ops_security_keys').update({ revoked_at: new Date().toISOString() }).eq('id', id).eq('user_id', userId).is('revoked_at', null).select('id');
  if (data?.length) await audit(db, userId, 'ops_key_removed', { id });
  return Boolean(data?.length);
}
