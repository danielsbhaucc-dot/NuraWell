import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => { throw new Error('no db in tests'); } }));
import { accessClosed, centralAuthOn, errorFor, matchUser, resetSigninModeCache, signinFailurePath, signinMode, SIGNIN_ERRORS, NO_LICENSE_COPY, type NwUser } from '@/lib/central/parent-signin';
import { authorizeUrl, packSigninTx, unpackSigninTx } from '@/lib/central/parent-connect';

const mkUser = (id: string, email: string, meta: Record<string, unknown> = {}, confirmed = true): NwUser => ({ id, email, email_confirmed_at: confirmed ? '2026-01-01' : null, app_metadata: meta });
const claims = { sub: 'sub_A', lic: 'lic_comp_nw_1111', email: 'a@x.co', email_verified: true };

describe('R20 parent sign-in', () => {
  it('the signin column is the only switch; a failed read is not off', async () => {
    resetSigninModeCache();
    expect(await signinMode({ PLATFORM_SIGNIN_MODE: 'on' }, 0, async () => 'off')).toBe('off');
    resetSigninModeCache();
    expect(await signinMode({}, 10_000, async () => 'all')).toBe('all');
    resetSigninModeCache();
    expect(await signinMode({ PLATFORM_SIGNIN_MODE: 'on' }, 20_000, async () => 'unreadable')).toBe('unreadable');
    expect(accessClosed('off')).toBe(false);
    expect(accessClosed('unreadable')).toBe(false);
    expect(accessClosed('all')).toBe(true);
    expect(centralAuthOn('off')).toBe(false);
    expect(centralAuthOn('unreadable')).toBe(false);
    expect(centralAuthOn('test')).toBe(true);
    expect(centralAuthOn('all')).toBe(true);
  });
  it('matches by sub, then license, then verified email on both sides', () => {
    const users = [mkUser('1', 'a@x.co', { pl_enforce_test: true }), mkUser('2', 'b@x.co', { pl_lic: 'lic_comp_nw_1111', pl_enforce_test: true }), mkUser('3', 'c@x.co', { pl_sub: 'sub_A', pl_enforce_test: true })];
    expect(matchUser(users, claims, 'test')).toMatchObject({ user: { id: '3' }, by: 'sub' });
    expect(matchUser(users.slice(0, 2), claims, 'test')).toMatchObject({ user: { id: '2' }, by: 'lic' });
    expect(matchUser(users.slice(0, 1), claims, 'test')).toMatchObject({ user: { id: '1' }, by: 'email' });
    expect(matchUser([mkUser('1', 'A@X.co', {}, true)], claims, 'all')).toMatchObject({ by: 'email' });
  });
  it('refuses: unverified parent email, unconfirmed NuraWell email, other parent link, out of test scope, no account', () => {
    expect(matchUser([mkUser('1', 'a@x.co')], { ...claims, email_verified: false }, 'all')).toEqual({ refuse: 'unverified' });
    expect(matchUser([mkUser('1', 'a@x.co', {}, false)], claims, 'all')).toEqual({ refuse: 'no_account' });
    expect(matchUser([mkUser('1', 'a@x.co', { pl_sub: 'sub_B' })], claims, 'all')).toEqual({ refuse: 'linked_elsewhere' });
    expect(matchUser([mkUser('1', 'a@x.co')], claims, 'test')).toEqual({ refuse: 'out_of_scope' });
    expect(matchUser([], claims, 'all')).toEqual({ refuse: 'no_account' });
  });
  it('nonce goes to authorize and is bound in the transaction cookie', () => {
    const url = new URL(authorizeUrl('s'.repeat(43), 'c'.repeat(43), 'n'.repeat(32)));
    expect(url.searchParams.get('nonce')).toBe('n'.repeat(32));
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    const tx = packSigninTx('s'.repeat(43), 'v'.repeat(64), 'n'.repeat(32));
    expect(unpackSigninTx(tx)).toEqual({ state: 's'.repeat(43), verifier: 'v'.repeat(64), nonce: 'n'.repeat(32), intent: 'login' });
    const signup = packSigninTx('s'.repeat(43), 'v'.repeat(64), 'n'.repeat(32), 'signup');
    expect(unpackSigninTx(signup)?.intent).toBe('signup');
    expect(unpackSigninTx(`${'s'.repeat(43)}.${'v'.repeat(64)}`)).toBeNull();
  });
  it('callback checks nonce and state, mints only a NuraWell session, errors go back to /login', () => {
    const cb = readFileSync('app/api/v1/central/callback/route.ts', 'utf8');
    expect(cb).toMatch(/boundNonceOk\(claims\.nonce, tx\.nonce\)/);
    expect(cb).toMatch(/stateMatches\(tx, String\(params\.get\('state'\)\)\)/);
    expect(cb).toMatch(/issueSessionForUser/);
    expect(cb).toMatch(/signinFailurePath\(/);
    expect(cb).toMatch(/packProvision/);
    expect(cb).toMatch(/licenseReasonFor/);
    expect(cb).not.toMatch(/createUser/); // product accounts are created only in onboarding, after a validated proof
  });
  it('every error code has neutral Hebrew text', () => {
    for (const why of ['state', 'nonce', 'no_account', 'linked_elsewhere', 'no_license', 'off', 'token', 'email_unverified', 'unsupported_mode', 'not_migrated']) expect(SIGNIN_ERRORS[errorFor(why)]).toMatch(/[א-ת]/);
    for (const text of Object.values(SIGNIN_ERRORS)) expect(text).not.toMatch(/תוכלו|תוכל |לכם|שלכם/);
    for (const key of ['parent_unverified', 'parent_no_license', 'parent_unsupported', 'parent_not_migrated']) expect(SIGNIN_ERRORS[key]).not.toMatch(/סיסמה/);
    expect(SIGNIN_ERRORS.parent_no_license).toBe(NO_LICENSE_COPY);
    expect(NO_LICENSE_COPY).toBe('עדיין אין לך מנוי ל-NuraWell');
  });
  it('signup reaches onboarding only with a validated proof; failures stay on login', () => {
    expect(signinFailurePath('no_account', 'signup')).toBe('/login?e=parent_no_account');
    expect(signinFailurePath('no_account', 'signup', true)).toBe('/register/form');
    expect(signinFailurePath('no_license', 'signup', true)).toBe('/login?e=parent_no_license');
    expect(signinFailurePath('no_account', 'login')).toBe('/login?e=parent_no_account');
  });
  it('does not map an existing account from an unverified email', () => {
    const users = [mkUser('1', 'a@x.co', {}, true)];
    expect(matchUser(users, { ...claims, email_verified: undefined }, 'all')).toEqual({ refuse: 'unverified' });
    expect(matchUser([mkUser('1', 'a@x.co', {}, false)], claims, 'all')).toEqual({ refuse: 'no_account' });
  });
  it('the product login has no second central button; the existing actions start parent auth when armed', () => {
    const login = readFileSync('app/(auth)/login/page.tsx', 'utf8');
    const register = readFileSync('components/onboarding/RegisterLandingClient.tsx', 'utf8');
    const route = readFileSync('app/api/v1/central/signin/route.ts', 'utf8');
    expect(login).not.toMatch(/כניסה בחשבון המרכזי/);
    expect(login).not.toMatch(/login-parent"/);
    expect(login).not.toMatch(/centralArmed && !isOpsHost/);
    expect(login).toMatch(/if \(centralArmed\)/);
    expect(login).toMatch(/NO_LICENSE_LINK/);
    expect(register).toMatch(/intent=signup/);
    expect(register).toMatch(/בואו נתחיל/);
    expect(route).toMatch(/centralAuthOn/);
    expect(route).not.toMatch(/buttonOn/);
  });
});
