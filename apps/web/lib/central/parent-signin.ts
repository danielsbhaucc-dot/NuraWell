import { createAdminClient } from '@/lib/supabase/admin';

/**
 * R20 — sign in to NuraWell with the parent account (OIDC code + PKCE + state + nonce).
 * Layers: env PLATFORM_SIGNIN_MODE=on (arm) AND platform_link_settings.signin ('off' | 'test' | 'all', kill switch).
 * The parent proves identity + license only; the NuraWell session, onboarding and data stay NuraWell's own.
 * Fail-closed for this button (unreadable settings ⇒ off); password login is untouched and always works.
 */
export type SigninMode = 'off' | 'test' | 'all';
const TTL_MS = 30_000;
let cached: { at: number; value: SigninMode } | null = null;

export async function signinMode(env: Record<string, string | undefined> = process.env, nowMs = Date.now()): Promise<SigninMode> {
  if (env.PLATFORM_SIGNIN_MODE !== 'on') return 'off';
  if (cached && nowMs - cached.at < TTL_MS) return cached.value;
  let value: SigninMode = 'off';
  try {
    const { data, error } = await createAdminClient().from('platform_link_settings').select('signin').eq('id', 1).maybeSingle();
    if (!error && (data?.signin === 'test' || data?.signin === 'all')) value = data.signin;
  } catch { value = 'off'; }
  cached = { at: nowMs, value };
  return value;
}

/** Is the button shown for this request? 'test' needs the explicit ?pl=parent hint. */
export const buttonOn = (mode: SigninMode, hint: string | null) => mode === 'all' || (mode === 'test' && hint === 'parent');

export type NwUser = { id: string; email?: string | null; email_confirmed_at?: string | null; app_metadata?: Record<string, unknown> | null };
export type ParentClaims = { sub: string; lic: string; email?: string; email_verified?: boolean };
export type Match = { user: NwUser; by: 'sub' | 'lic' | 'email' } | { refuse: 'linked_elsewhere' | 'no_account' | 'out_of_scope' | 'unverified' };

const norm = (e: unknown) => (typeof e === 'string' ? e.trim().toLowerCase() : '');

/**
 * Pure matching: which NuraWell account does this parent identity sign in to?
 * 1. app_metadata.pl_sub === sub   2. app_metadata.pl_lic === lic   3. same email, verified on BOTH sides.
 * Never takes over an account already linked to a different parent identity. No account ⇒ normal NuraWell registration.
 */
export function matchUser(users: NwUser[], c: ParentClaims, mode: SigninMode): Match {
  if (c.email_verified !== true || !norm(c.email)) return { refuse: 'unverified' };
  const meta = (u: NwUser) => u.app_metadata ?? {};
  const bySub = users.find((u) => meta(u).pl_sub === c.sub);
  const byLic = bySub ? undefined : users.find((u) => meta(u).pl_lic === c.lic);
  const byEmail = bySub || byLic ? undefined : users.find((u) => norm(u.email) === norm(c.email) && Boolean(u.email_confirmed_at));
  const hit = bySub ? { user: bySub, by: 'sub' as const } : byLic ? { user: byLic, by: 'lic' as const } : byEmail ? { user: byEmail, by: 'email' as const } : null;
  if (!hit) return { refuse: 'no_account' };
  const linked = meta(hit.user).pl_sub;
  if (typeof linked === 'string' && linked !== c.sub) return { refuse: 'linked_elsewhere' };
  if (mode !== 'all' && meta(hit.user).pl_enforce_test !== true) return { refuse: 'out_of_scope' };
  return hit;
}

export { SIGNIN_ERRORS } from './parent-signin-text';

export const errorFor = (why: string): string =>
  why === 'no_account' ? 'parent_no_account' : why === 'linked_elsewhere' ? 'parent_linked' : why === 'no_license' || why === 'access_denied' ? 'parent_no_license' : 'parent_unavailable';
