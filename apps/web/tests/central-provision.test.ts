import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  allowProductProvision,
  entitlementAllowsProvision,
  localMethodAllowed,
  packProvision,
  provisionRefusal,
  unpackProvision,
} from '@/lib/central/parent-provision';

const secret = 's'.repeat(32);
const proof = { product: 'nurawell' as const, sub: 'sub_A', lic: 'lic_comp_nw_1111', email: 'a@x.co', exp: 2_000_000_000 };

describe('product provisioning gate', () => {
  it('refuses unverified email and a missing license before any account exists', () => {
    expect(provisionRefusal({ sub: 'sub_A', lic: 'lic_comp_nw_1111', email: 'a@x.co', email_verified: false })).toBe('unverified');
    expect(provisionRefusal({ sub: 'sub_A', lic: 'lic_comp_nw_1111', email: 'a@x.co' })).toBe('unverified');
    expect(provisionRefusal({ sub: 'sub_A', lic: 'nope', email: 'a@x.co', email_verified: true })).toBe('no_license');
    expect(provisionRefusal({ sub: 'sub_A', lic: 'lic_comp_nw_1111', email: 'a@x.co', email_verified: true })).toBeNull();
  });

  it('opens onboarding only for an active entitlement', () => {
    expect(entitlementAllowsProvision('active')).toBe(true);
    for (const reason of ['no_status', 'stale_status', 'unknown_license', 'revoked', 'suspended', 'expired', 'no_license']) {
      expect(entitlementAllowsProvision(reason)).toBe(false);
    }
  });

  it('rejects a missing, mismatched, tampered or expired proof and does not create from the form email alone', () => {
    expect(allowProductProvision('off', null, 'other@x.co')).toBe('skip');
    expect(allowProductProvision('all', null, 'a@x.co')).toBe('missing');
    expect(allowProductProvision('all', proof, 'other@x.co')).toBe('email');
    expect(allowProductProvision('test', proof, 'A@X.co')).toBe('ok');
    const packed = packProvision(proof, secret);
    expect(packed).toBeTruthy();
    expect(unpackProvision(packed!, secret, proof.exp - 10)).toMatchObject({ email: 'a@x.co', lic: proof.lic, sub: proof.sub });
    expect(unpackProvision(packed!, secret, proof.exp + 5)).toBeNull();
    expect(unpackProvision(`${packed!.slice(0, -2)}aa`, secret, proof.exp - 10)).toBeNull();
    expect(unpackProvision(packed!, 'x'.repeat(32), proof.exp - 10)).toBeNull();
    expect(packProvision({ ...proof, product: 'elsewhere' as 'nurawell' }, secret)).toBeNull();
    const foreign = Buffer.from(JSON.stringify({ sub: proof.sub, lic: proof.lic, email: proof.email, exp: proof.exp })).toString('base64url');
    expect(unpackProvision(foreign, secret, proof.exp - 10)).toBeNull();
  });

  it('keeps Face ID and QR from minting a local session while central-only mode is on', () => {
    expect(localMethodAllowed('off')).toBe(true);
    expect(localMethodAllowed('test')).toBe(false);
    expect(localMethodAllowed('all')).toBe(false);
    expect(localMethodAllowed('unreadable')).toBe(true);
    const passkey = readFileSync('app/api/v1/auth/passkey/route.ts', 'utf8');
    const qr = readFileSync('app/api/v1/auth/qr/route.ts', 'utf8');
    expect(passkey.indexOf('localMethodAllowed(')).toBeLessThan(passkey.indexOf('issueSessionForUser('));
    expect(qr.indexOf('localMethodAllowed(')).toBeLessThan(qr.indexOf('issueSessionForUser('));
    expect(passkey).toMatch(/parent_method_unsupported/);
    expect(qr).toMatch(/parent_method_unsupported/);
  });

  it('direct onboarding and the signup action cannot create a product identity ahead of the proof', () => {
    const form = readFileSync('app/(auth)/register/form/page.tsx', 'utf8');
    const action = readFileSync('lib/actions/complete-onboarding.ts', 'utf8');
    const login = readFileSync('app/(auth)/login/page.tsx', 'utf8');
    expect(form).toMatch(/unpackProvision/);
    expect(form).toMatch(/intent=signup/);
    expect(action.indexOf('allowProductProvision')).toBeLessThan(action.indexOf('createUser'));
    expect(action).toMatch(/email_confirm: parentVerified/);
    expect(action.indexOf('if (!parentVerified)')).toBeLessThan(action.indexOf('auth.resend'));
    expect(action).toMatch(/updateUserById\(created\.user\.id, \{ email_confirm: true \}\)/);
    expect(action).not.toMatch(/updateUserById\([^)]*email[^)]*email_confirm/);
    expect(action).toMatch(/pl_sub: proof\.sub/);
    expect(action).not.toMatch(/identity\/signup|copyPassword/);
    const passkey = login.slice(login.indexOf('const handlePasskey'), login.indexOf('const handleBackup'));
    expect(passkey).not.toMatch(/startCentralLogin/);
    expect(passkey).toMatch(/parent_method_unsupported/);
  });
});
