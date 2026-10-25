import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { acceptAdminKey, adminKeyRegistrationPolicy, counterOk, keyLimitReached } from '@/lib/security-core/webauthn-policy';

describe('webauthn-policy (admin hardware keys)', () => {
  it('asks for a roaming key with user verification', () => {
    const p = adminKeyRegistrationPolicy();
    expect(p.authenticatorSelection.authenticatorAttachment).toBe('cross-platform');
    expect(p.authenticatorSelection.userVerification).toBe('required');
  });
  it('rejects synced passkeys and keys without UV', () => {
    expect(acceptAdminKey({ credentialDeviceType: 'singleDevice', credentialBackedUp: false, userVerified: true }).ok).toBe(true);
    expect(acceptAdminKey({ credentialDeviceType: 'multiDevice', credentialBackedUp: true, userVerified: true })).toEqual({ ok: false, reason: 'synced' });
    expect(acceptAdminKey({ credentialDeviceType: 'singleDevice', credentialBackedUp: true, userVerified: true })).toEqual({ ok: false, reason: 'synced' });
    expect(acceptAdminKey({ credentialDeviceType: 'singleDevice', credentialBackedUp: false, userVerified: false })).toEqual({ ok: false, reason: 'no_uv' });
  });
  it('counter must increase (0/0 allowed)', () => {
    expect(counterOk(0, 0)).toBe(true);
    expect(counterOk(5, 6)).toBe(true);
    expect(counterOk(5, 5)).toBe(false);
    expect(counterOk(5, 0)).toBe(false);
  });
  it('limit', () => { expect(keyLimitReached(4)).toBe(false); expect(keyLimitReached(5)).toBe(true); });
  it('policy module is product-agnostic', () => {
    const src = readFileSync(new URL('../lib/security-core/webauthn-policy.ts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/from '@\//);
    expect(src).not.toMatch(/nurawell/i);
  });
});

describe('ops key route gates', () => {
  const src = readFileSync(new URL('../app/api/v1/ops/device/key/route.ts', import.meta.url), 'utf8');
  it('removing a key needs a recovery code', () => { expect(src).toMatch(/verifyRecoveryCode\(g\.db, g\.actor, a\.code, 'remove_security_key'\)/); });
  it('managing keys needs approved device + step-up', () => { expect(src).toMatch(/requireIrAdmin\(request, \{ stepUp: a\.action !== 'register_verify' \}\)/); });
  it('login tap only approves the caller own pending request', () => { expect(src).toMatch(/requestForPendingCookie\(db, uid/); });
  it('device route alerts the owner when a recovery code is used', () => {
    const d = readFileSync(new URL('../app/api/v1/ops/device/route.ts', import.meta.url), 'utf8');
    expect(d).toMatch(/if \(a\.action === 'recovery'\) await alertOwnerSecurity/);
  });
});

describe('logs CSV + auth trail', () => {
  it('CSV export never includes the investigation field (raw IP / session)', async () => {
    const { toCsv } = await import('@/lib/logs/query');
    const csv = toCsv([{ id: '1', at: 't', type: 'admin', actor: 'a', action: 'GET', target: '/x', result: 'GET', ip: '1.2.x.x', country: 'IL', detail: '', inv: { user: 'u-secret', session: 's-secret', ipRaw: '9.9.9.9' } }]);
    expect(csv).not.toMatch(/inv|u-secret|s-secret|9\.9\.9\.9/);
  });
  it('session trail migration records every new session, service-role only, never breaks sign-in', () => {
    const m = readFileSync(new URL('../../../supabase/migrations/000189_auth_session_trail.sql', import.meta.url), 'utf8');
    expect(m).toMatch(/after insert on auth\.sessions/);
    expect(m).toMatch(/revoke all on public\.auth_session_trail from public, anon, authenticated/);
    expect(m).toMatch(/exception when others then null/);
    expect(m).toMatch(/'auth_session_trail','created_at',730,'access'/);
  });
});
