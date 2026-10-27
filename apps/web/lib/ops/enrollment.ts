import 'server-only';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';
import {
  generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse,
  type AuthenticationResponseJSON, type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import {
  ENROLL_MAX_OPEN_LINKS, ENROLL_TTL_MS, MATCH_TTL_MS, enrollStage, matchOptions, mayRegisterPasskey, wellFormedToken, type EnrollState,
} from '@platform/access';
import { consumeChallenge, storeChallenge, RP_NAME } from '@/lib/module-api/auth-signup/lib-auth-passkeys';
import { counterOk } from '@/lib/security-core/webauthn-policy';
import { audit, createTrustedDevice, deviceLabel } from './device-trust';

/**
 * Hidden-admin device enrollment. Order is enforced server-side, each step checks the previous one:
 *  1. one-time Telegram link (sha256 at rest, 10 min, atomic single-use claim) → browser-bound enrollment cookie
 *  2. password + an existing strong factor (backup code, existing passkey or hardware key)
 *  3. number matching on Telegram (3 buttons, 2 min, bound to this enrollment, single use; wrong = revoke + block)
 *  4. only then: register a platform passkey (UV required) and set the device cookie bound to that credential.
 */
export const ENROLL_COOKIE = 'nw_ops_enr';
export const ENROLL_PATH = '/k';
export const ENROLL_BLOCK_MIN = 30;
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const b64u = (b: Uint8Array) => Buffer.from(b).toString('base64url');

type Row = {
  id: string; user_id: string; session_hash: string | null; ip_hash: string | null; label: string; location: string;
  expires_at: string; used_at: string | null; revoked_at: string | null; factor_ok_at: string | null; factor_via: string | null;
  match_number: number | null; match_expires_at: string | null; match_decided_at: string | null; match_result: EnrollState['matchResult']; completed_at: string | null;
};
const t = (s: string | null) => (s ? Date.parse(s) : null);
export const stateOf = (r: Row): EnrollState => ({
  usedAt: t(r.used_at), revokedAt: t(r.revoked_at), expiresAt: Date.parse(r.expires_at), factorOkAt: t(r.factor_ok_at),
  matchResult: r.match_result, matchExpiresAt: t(r.match_expires_at), matchDecidedAt: t(r.match_decided_at), completedAt: t(r.completed_at),
});

/* ── 0. Gideon issues a link (owner-verified Telegram sender only; checked by the webhook) ── */
export async function issueEnrollmentLink(db: SupabaseClient, userId: string, baseUrl: string): Promise<{ ok: true; url: string; expiresAt: string } | { ok: false; error: 'too_many' }> {
  const since = new Date(Date.now() - ENROLL_TTL_MS).toISOString();
  const { count } = await db.from('ops_device_enrollments').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', since);
  if ((count ?? 0) >= ENROLL_MAX_OPEN_LINKS) return { ok: false, error: 'too_many' };
  const token = b64u(randomBytes(32));
  const expiresAt = new Date(Date.now() + ENROLL_TTL_MS).toISOString();
  const { error } = await db.from('ops_device_enrollments').insert({ user_id: userId, token_hash: sha(token), expires_at: expiresAt });
  if (error) throw new Error('enrollment insert failed');
  await audit(db, userId, 'ops_enroll_link_issued', {});
  return { ok: true, url: `${baseUrl.replace(/\/$/, '')}${ENROLL_PATH}/${token}`, expiresAt };
}

/* ── 1. open the link: atomic claim, binds the enrollment to this browser ── */
export async function openEnrollment(db: SupabaseClient, token: unknown, facts: { ipHash: string | null; label: string; location: string }): Promise<{ ok: true; cookie: string } | { ok: false }> {
  if (!wellFormedToken(token)) return { ok: false };
  const secret = b64u(randomBytes(32));
  const { data } = await db.rpc('ops_claim_enrollment', { p_token_hash: sha(token), p_session_hash: sha(secret), p_ip_hash: facts.ipHash });
  const row = (data as { id: string; user_id: string }[] | null)?.[0];
  if (!row) return { ok: false };
  await db.from('ops_device_enrollments').update({ label: facts.label.slice(0, 80), location: facts.location.slice(0, 80) }).eq('id', row.id);
  await audit(db, row.user_id, 'ops_enroll_link_opened', { id: row.id });
  return { ok: true, cookie: `${row.id}.${secret}` };
}

export async function loadByCookie(db: SupabaseClient, cookie: string | null | undefined): Promise<Row | null> {
  const m = /^([0-9a-f-]{36})\.([A-Za-z0-9_-]{43})$/.exec(cookie ?? '');
  if (!m) return null;
  const { data } = await db.from('ops_device_enrollments').select('*').eq('id', m[1]).maybeSingle();
  const r = data as Row | null;
  if (!r || !r.session_hash || r.session_hash !== sha(m[2])) return null;
  return r;
}

export async function ipBlocked(db: SupabaseClient, ipHash: string | readonly string[] | null): Promise<boolean> {
  const hs = (Array.isArray(ipHash) ? ipHash : [ipHash]).filter((x): x is string => Boolean(x));
  if (!hs.length) return false;
  const { data } = await db.from('ops_enroll_blocks').select('blocked_until').in('ip_hash', hs);
  return ((data ?? []) as { blocked_until: string }[]).some((r) => Date.parse(r.blocked_until) > Date.now());
}

/* ── 2. password + strong factor ── */
export type PasswordCheck = (email: string, password: string) => Promise<string | null>;
export const supabasePasswordCheck: PasswordCheck = async (email, password) => {
  const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error || !data.user) return null;
  await c.auth.signOut({ scope: 'local' }).catch(() => undefined); // throwaway session: verify only
  return data.user.id;
};

type CredRow = { id: string; credential_id: string; public_key: string; counter: number; transports?: string[]; src: 'key' | 'device' };
async function strongCreds(db: SupabaseClient, userId: string): Promise<CredRow[]> {
  const [{ data: keys }, { data: devs }] = await Promise.all([
    db.from('ops_security_keys').select('id, credential_id, public_key, counter, transports').eq('user_id', userId).is('revoked_at', null),
    db.from('ops_trusted_devices').select('id, credential_id, public_key, sign_count').eq('user_id', userId).is('revoked_at', null).not('credential_id', 'is', null),
  ]);
  return [
    ...((keys ?? []) as { id: string; credential_id: string; public_key: string; counter: number; transports: string[] }[]).map((k) => ({ ...k, src: 'key' as const })),
    ...((devs ?? []) as { id: string; credential_id: string; public_key: string; sign_count: number }[]).map((d) => ({ id: d.id, credential_id: d.credential_id, public_key: d.public_key, counter: Number(d.sign_count), src: 'device' as const })),
  ];
}

export async function factorPasskeyOptions(db: SupabaseClient, r: Row, rp: { origin: string; rpID: string }) {
  const creds = await strongCreds(db, r.user_id);
  if (!creds.length) return null;
  const options = await generateAuthenticationOptions({ rpID: rp.rpID, userVerification: 'required', allowCredentials: creds.map((c) => ({ id: c.credential_id, transports: (c.transports ?? []) as never })) });
  const secret = await storeChallenge(db, { userId: r.user_id, purpose: 'login', challenge: options.challenge, ...rp });
  return { options, secret };
}

export type FactorInput =
  | { method: 'backup'; code: string }
  | { method: 'passkey'; challengeCookie: string | null; response: AuthenticationResponseJSON };

export async function verifyStrongFactor(db: SupabaseClient, userId: string, f: FactorInput): Promise<boolean> {
  if (f.method === 'backup') {
    const { data } = await db.rpc('ops_use_recovery_code', { p_user: userId, p_code: f.code });
    return data === true;
  }
  const ch = await consumeChallenge(db, f.challengeCookie, 'login');
  if (!ch || ch.user_id !== userId || typeof f.response?.id !== 'string' || f.response.id.length > 1400) return false;
  const c = (await strongCreds(db, userId)).find((x) => x.credential_id === f.response.id);
  if (!c) return false;
  try {
    const v = await verifyAuthenticationResponse({ response: f.response, expectedChallenge: ch.challenge, expectedOrigin: ch.origin, expectedRPID: ch.rp_id, requireUserVerification: true,
      credential: { id: c.credential_id, publicKey: new Uint8Array(Buffer.from(c.public_key, 'base64url')), counter: c.counter, transports: (c.transports ?? []) as never } });
    if (!v.verified || !v.authenticationInfo.userVerified || !counterOk(c.counter, v.authenticationInfo.newCounter)) return false;
    if (c.src === 'key') await db.from('ops_security_keys').update({ counter: v.authenticationInfo.newCounter, last_used_at: new Date().toISOString() }).eq('id', c.id);
    else await db.from('ops_trusted_devices').update({ sign_count: v.authenticationInfo.newCounter }).eq('id', c.id);
    return true;
  } catch { return false; }
}

export type FactorResult = { ok: true; number: number; options: number[] } | { ok: false; error: 'stage' | 'password' | 'factor' };
/** Step 2. On success arms number matching and returns the number for the device + the 3 options for Telegram. */
export async function completeFactor(db: SupabaseClient, r: Row, input: { email: string; password: string; factor: FactorInput }, deps: { checkPassword?: PasswordCheck } = {}): Promise<FactorResult> {
  if (enrollStage(stateOf(r), Date.now()) !== 'opened') return { ok: false, error: 'stage' };
  const uid = await (deps.checkPassword ?? supabasePasswordCheck)(input.email, input.password);
  if (uid !== r.user_id) { await audit(db, r.user_id, 'ops_enroll_password_failed', { id: r.id }); return { ok: false, error: 'password' }; }
  if (!(await verifyStrongFactor(db, r.user_id, input.factor))) { await audit(db, r.user_id, 'ops_enroll_factor_failed', { id: r.id, method: input.factor.method }); return { ok: false, error: 'factor' }; }
  const n = randomInt(10, 100);
  const { data } = await db.from('ops_device_enrollments').update({
    factor_ok_at: new Date().toISOString(), factor_via: input.factor.method, match_number: n,
    match_sent_at: new Date().toISOString(), match_expires_at: new Date(Date.now() + MATCH_TTL_MS).toISOString(),
  }).eq('id', r.id).is('factor_ok_at', null).is('revoked_at', null).select('id');
  if (!data?.length) return { ok: false, error: 'stage' };
  await audit(db, r.user_id, 'ops_enroll_factor_ok', { id: r.id, via: input.factor.method });
  return { ok: true, number: n, options: matchOptions(n) };
}

/* ── 3. number tap from Telegram ── */
export type DecideResult = 'approved' | 'wrong' | 'expired' | 'used' | 'not_found' | 'not_ready';
export async function decideMatch(db: SupabaseClient, id: string, n: number): Promise<{ result: DecideResult; row: Row | null }> {
  const { data } = await db.rpc('ops_enroll_decide', { p_id: id, p_number: n });
  const result = (typeof data === 'string' ? data : 'not_found') as DecideResult;
  const { data: row } = await db.from('ops_device_enrollments').select('*').eq('id', id).maybeSingle();
  const r = row as Row | null;
  if (r && (result === 'wrong')) {
    if (r.ip_hash) await db.from('ops_enroll_blocks').upsert({ ip_hash: r.ip_hash, blocked_until: new Date(Date.now() + ENROLL_BLOCK_MIN * 60_000).toISOString(), reason: 'wrong_number' });
    await audit(db, r.user_id, 'ops_enroll_wrong_number', { id });
  } else if (r && result === 'approved') await audit(db, r.user_id, 'ops_enroll_number_ok', { id });
  return { result, row: r };
}

/* ── 4. passkey registration, only after approval ── */
export async function registrationOptions(db: SupabaseClient, r: Row, email: string, rp: { origin: string; rpID: string }) {
  if (!mayRegisterPasskey(stateOf(r), Date.now())) return null;
  const existing = await strongCreds(db, r.user_id);
  const options = await generateRegistrationOptions({
    rpName: `${RP_NAME} Ops`, rpID: rp.rpID, userName: email, userDisplayName: email,
    userID: new Uint8Array(createHash('sha256').update(`ops-dev:${r.user_id}`).digest()),
    attestationType: 'none', timeout: 120_000,
    authenticatorSelection: { authenticatorAttachment: 'platform', residentKey: 'preferred', userVerification: 'required' },
    excludeCredentials: existing.map((c) => ({ id: c.credential_id })),
  });
  const secret = await storeChallenge(db, { userId: r.user_id, purpose: 'register', challenge: options.challenge, ...rp });
  return { options, secret };
}

export async function finishEnrollment(db: SupabaseClient, r: Row, challengeCookie: string | null, response: RegistrationResponseJSON, facts: { ua: string | null; ipHash: string | null; ipMasked: string; country: string }): Promise<{ ok: true; deviceCookie: string; deviceId: string } | { ok: false }> {
  if (!mayRegisterPasskey(stateOf(r), Date.now())) return { ok: false };
  const ch = await consumeChallenge(db, challengeCookie, 'register');
  if (!ch || ch.user_id !== r.user_id) return { ok: false };
  let v;
  try {
    v = await verifyRegistrationResponse({ response, expectedChallenge: ch.challenge, expectedOrigin: ch.origin, expectedRPID: ch.rp_id, requireUserVerification: true });
  } catch { return { ok: false }; }
  if (!v.verified || !v.registrationInfo || !v.registrationInfo.userVerified) return { ok: false };
  // completed exactly once (concurrent finish → only one wins)
  const { data: done } = await db.from('ops_device_enrollments').update({ completed_at: new Date().toISOString() }).eq('id', r.id).is('completed_at', null).is('revoked_at', null).eq('match_result', 'approved').select('id');
  if (!done?.length) return { ok: false };
  const cred = v.registrationInfo.credential;
  const cookie = await createTrustedDevice(db, r.user_id, deviceLabel(facts.ua), 'enrollment');
  const deviceId = cookie.split('.')[0];
  await db.from('ops_trusted_devices').update({
    credential_id: cred.id, public_key: b64u(cred.publicKey), sign_count: cred.counter, browser: deviceLabel(facts.ua).slice(0, 80),
    last_ip_hash: facts.ipHash, last_ip_masked: facts.ipMasked, last_country: facts.country || null,
  }).eq('id', deviceId);
  await db.from('ops_device_enrollments').update({ device_id: deviceId }).eq('id', r.id);
  await audit(db, r.user_id, 'ops_enroll_completed', { id: r.id, device: deviceId });
  return { ok: true, deviceCookie: cookie, deviceId };
}
