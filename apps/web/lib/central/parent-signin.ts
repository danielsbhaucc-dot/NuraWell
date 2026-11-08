import { createAdminClient } from '@/lib/supabase/admin';

/**
 * R20 — sign in to NuraWell with the parent account (OIDC code + PKCE + state + nonce).
 * Enforcement follows platform_link_settings.signin, the same column parent_session_ok() reads.
 * PLATFORM_SIGNIN_MODE is not a second switch: it cannot leave the database enforcing while the app
 * accepts a password session, and it cannot turn a positive test/all back into off.
 * Explicit 'off' is the break-glass for product users and ops together.
 * A missing row or a read error is 'unreadable' and does not turn today's password mode off.
 * Enforcement starts only when the column is positively 'test' or 'all'. Apply migration 000232
 * while the column is still off; the database then keeps current policies until the column changes.
 * Do not enable until a restorable platform-central backup exists, migration 000039 is applied,
 * migration 000232 is applied, ops can complete parent sign-in, and the parent mail sender is no-reply.
 */
export type SigninMode = 'off' | 'test' | 'all' | 'unreadable';
const TTL_MS = 30_000;
let cached: { at: number; value: Exclude<SigninMode, 'unreadable'> } | null = null;

const asMode = (raw: unknown): SigninMode => (raw === 'off' || raw === 'test' || raw === 'all' ? raw : 'unreadable');

const readMode = async (): Promise<SigninMode> => {
  try {
    const { data, error } = await createAdminClient().from('platform_link_settings').select('signin').eq('id', 1).maybeSingle();
    if (error || !data) return 'unreadable';
    return asMode(data.signin);
  } catch { return 'unreadable'; }
};

export function resetSigninModeCache(): void {
  cached = null;
}

/**
 * Column value. A positive result is cached ≤30 s. A failed read is never cached and never reported as off.
 * `env` is accepted so existing callers keep compiling; it does not weaken the column.
 */
export const signinMode = async (
  env: Record<string, string | undefined> = process.env,
  nowMs = Date.now(),
  read: () => Promise<SigninMode> = readMode,
): Promise<SigninMode> => {
  void env;
  if (cached && nowMs - cached.at < TTL_MS) return cached.value;
  const value = await read();
  if (value === 'unreadable') return 'unreadable';
  cached = { at: nowMs, value };
  return value;
};

/** Parent OIDC can start. Unreadable stays on the existing password screen. */
export const centralAuthOn = (mode: SigninMode) => mode === 'test' || mode === 'all';

/** Protected data is closed only when the column positively says test or all. */
export const accessClosed = (mode: SigninMode) => mode === 'test' || mode === 'all';

/**
 * Who must present a parent session. `all` means every signed-in account.
 * `test` means only an account whose server-written app_metadata.pl_enforce_test is true.
 * Everyone else keeps today's session, matching parent_session_ok().
 */
export function sessionProofRequired(mode: SigninMode, appMetadata?: Record<string, unknown> | null): boolean {
  if (mode === 'all') return true;
  if (mode !== 'test') return false;
  const value = appMetadata?.pl_enforce_test;
  return value === true || value === 'true';
}

export type NwUser = { id: string; email?: string | null; email_confirmed_at?: string | null; app_metadata?: Record<string, unknown> | null };
export type ParentClaims = { sub: string; lic: string; email?: string; email_verified?: boolean };
type Hit = { user: NwUser; by: 'sub' | 'lic' | 'email' };
export type Match = Hit | { refuse: 'linked_elsewhere' | 'no_account' | 'out_of_scope' | 'unverified' };

const norm = (email: unknown) => (typeof email === 'string' ? email.trim().toLowerCase() : '');
const meta = (user: NwUser) => user.app_metadata ?? {};

/** 1. app_metadata.pl_sub === sub   2. app_metadata.pl_lic === lic   3. same email, confirmed in NuraWell. */
const findHit = (users: NwUser[], claims: ParentClaims): Hit | null => {
  const bySub = users.find((user) => meta(user).pl_sub === claims.sub);
  if (bySub) return { user: bySub, by: 'sub' };
  const byLic = users.find((user) => meta(user).pl_lic === claims.lic);
  if (byLic) return { user: byLic, by: 'lic' };
  const byEmail = users.find((user) => norm(user.email) === norm(claims.email) && Boolean(user.email_confirmed_at));
  return byEmail ? { user: byEmail, by: 'email' } : null;
};

const linkedElsewhere = (user: NwUser, sub: string) => typeof meta(user).pl_sub === 'string' && meta(user).pl_sub !== sub;

/**
 * Pure matching: which NuraWell account does this parent identity sign in to? Parent email must be verified.
 * Never takes over an account already linked to a different parent identity. No account ⇒ normal NuraWell registration.
 */
// skipcq: JS-R1005 -- flat ordered refusal guards
export const matchUser = (users: NwUser[], claims: ParentClaims, mode: SigninMode): Match => {
  if (claims.email_verified !== true || !norm(claims.email)) return { refuse: 'unverified' };
  const hit = findHit(users, claims);
  if (!hit) return { refuse: 'no_account' };
  if (linkedElsewhere(hit.user, claims.sub)) return { refuse: 'linked_elsewhere' };
  if (mode !== 'all' && meta(hit.user).pl_enforce_test !== true) return { refuse: 'out_of_scope' };
  return hit;
};

export { NO_LICENSE_COPY, NO_LICENSE_LINK, SIGNIN_ERRORS } from './parent-signin-text';

const ERROR_KEYS: Record<string, string> = {
  no_account: 'parent_no_account', linked_elsewhere: 'parent_linked', no_license: 'parent_no_license', access_denied: 'parent_no_license',
  email_unverified: 'parent_unverified', unsupported_mode: 'parent_unsupported', not_migrated: 'parent_not_migrated',
};
/** A stale or missing one-time transaction. The same login button starts a new one. It is not a password fallback. */
const RESTART_REASONS = new Set(['state', 'nonce', 'code', 'token', 'token_invalid']);
/** Failure reason → /login?e= key. An expired parent request restarts. Anything else unknown is "unavailable". */
export const errorFor = (why: string): string => (RESTART_REASONS.has(why) ? 'parent_restart' : ERROR_KEYS[why] ?? 'parent_unavailable');

/**
 * Where a failed parent sign-in returns.
 * Onboarding opens only when this browser already holds a validated parent proof (proofReady).
 * Otherwise a direct visit cannot create a product account.
 */
export const signinFailurePath = (why: string, intent: 'login' | 'signup' = 'login', proofReady = false) =>
  why === 'no_account' && intent === 'signup' && proofReady ? '/register/form' : `/login?e=${errorFor(why)}`;
