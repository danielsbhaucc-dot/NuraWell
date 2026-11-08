import { createAdminClient } from '@/lib/supabase/admin';

/**
 * R20 — sign in to NuraWell with the parent account (OIDC code + PKCE + state + nonce).
 * Layers: env PLATFORM_SIGNIN_MODE=on (arm) AND platform_link_settings.signin ('off' | 'test' | 'all', kill switch).
 * The parent proves identity + license only; the NuraWell session, onboarding and data stay NuraWell's own.
 * Fail-closed (unreadable settings ⇒ off). Off keeps the existing product password login.
 * Test or all: the product's own login and signup start this flow. There is no second button.
 */
export type SigninMode = 'off' | 'test' | 'all';
const TTL_MS = 30_000;
let cached: { at: number; value: SigninMode } | null = null;

const asMode = (raw: unknown): SigninMode => (raw === 'test' || raw === 'all' ? raw : 'off');

const readMode = async (): Promise<SigninMode> => {
  try {
    const { data, error } = await createAdminClient().from('platform_link_settings').select('signin').eq('id', 1).maybeSingle();
    return error ? 'off' : asMode(data?.signin);
  } catch { return 'off'; }
};

/** Effective sign-in mode (env arm AND DB switch), cached ≤30 s. */
export const signinMode = async (env: Record<string, string | undefined> = process.env, nowMs = Date.now()): Promise<SigninMode> => {
  if (env.PLATFORM_SIGNIN_MODE !== 'on') return 'off';
  if (cached && nowMs - cached.at < TTL_MS) return cached.value;
  cached = { at: nowMs, value: await readMode() };
  return cached.value;
};

/** Parent identity is the authenticator for the product's own login and signup. Off keeps local password login. */
export const centralAuthOn = (mode: SigninMode) => mode === 'test' || mode === 'all';

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

const ERROR_KEYS: Record<string, string> = { no_account: 'parent_no_account', linked_elsewhere: 'parent_linked', no_license: 'parent_no_license', access_denied: 'parent_no_license' };
/** Failure reason → /login?e= key (anything unknown ⇒ "unavailable"). */
export const errorFor = (why: string): string => ERROR_KEYS[why] ?? 'parent_unavailable';

/** Where a failed parent sign-in returns. A new signup with no product account continues into onboarding. */
export const signinFailurePath = (why: string, intent: 'login' | 'signup' = 'login') =>
  why === 'no_account' && intent === 'signup' ? '/register/form' : `/login?e=${errorFor(why)}`;
