import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => { throw new Error('no db in tests'); } }));
import { buttonOn, errorFor, matchUser, signinMode, SIGNIN_ERRORS, type NwUser } from '@/lib/central/parent-signin';
import { authorizeUrl, packSigninTx, unpackSigninTx } from '@/lib/central/parent-connect';

const mkUser = (id: string, email: string, meta: Record<string, unknown> = {}, confirmed = true): NwUser => ({ id, email, email_confirmed_at: confirmed ? '2026-01-01' : null, app_metadata: meta });
const claims = { sub: 'sub_A', lic: 'lic_comp_nw_1111', email: 'a@x.co', email_verified: true };

describe('R20 parent sign-in', () => {
  it('kill switch: env arm required, unreadable settings ⇒ off', async () => {
    expect(await signinMode({})).toBe('off');
    expect(await signinMode({ PLATFORM_SIGNIN_MODE: 'on' })).toBe('off');
    expect(buttonOn('off', 'parent')).toBe(false);
    expect(buttonOn('test', null)).toBe(false);
    expect(buttonOn('test', 'parent')).toBe(true);
    expect(buttonOn('all', null)).toBe(true);
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
    expect(unpackSigninTx(tx)).toEqual({ state: 's'.repeat(43), verifier: 'v'.repeat(64), nonce: 'n'.repeat(32) });
    expect(unpackSigninTx(`${'s'.repeat(43)}.${'v'.repeat(64)}`)).toBeNull();
  });
  it('callback checks nonce and state, mints only a NuraWell session, errors go back to /login', () => {
    const cb = readFileSync('app/api/v1/central/callback/route.ts', 'utf8');
    expect(cb).toMatch(/timingSafeEqualStr\(claims\.nonce, tx\.nonce\)/);
    expect(cb).toMatch(/stateMatches\(tx, String\(params\.get\('state'\)\)\)/);
    expect(cb).toMatch(/issueSessionForUser/);
    expect(cb).toMatch(/\/login\?e=\$\{errorFor\(why\)\}/);
    expect(cb).not.toMatch(/createUser/); // no account ⇒ normal NuraWell registration (onboarding + consent unchanged)
  });
  it('every error code has neutral Hebrew text', () => {
    for (const why of ['state', 'nonce', 'no_account', 'linked_elsewhere', 'no_license', 'off', 'token']) expect(SIGNIN_ERRORS[errorFor(why)]).toMatch(/[א-ת]/);
    for (const text of Object.values(SIGNIN_ERRORS)) expect(text).not.toMatch(/תוכלו|תוכל |לכם|שלכם/);
  });
});
