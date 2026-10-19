import { beforeAll, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import {
  __resetDeviceKey, createEmailChallenge, createTrustedDevice, decideRequest, deviceLabel, isTrustedDevice, makeCookieValue,
  newCode, parseCookieValue, redeemEmailCode, redeemEmailLink, revokeDevice, startLoginRequest, requestForPendingCookie, consumeApproved,
} from '@/lib/ops/device-trust';
import { claimHandoff, createHandoff } from '@/lib/ops/handoff';
import { sessionIdFromJwt } from '@/lib/ops/device-gate';
import { fakeDb } from './helpers/fake-db';

const U = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asDb = (d: unknown) => d as any;
const hdr = (ua = 'Mozilla/5.0 (iPhone) Safari/605', ip = '1.2.3.4') => new Headers({ 'user-agent': ua, 'x-real-ip': ip });

beforeAll(() => { process.env.PII_ENCRYPTION_KEY = randomBytes(32).toString('base64'); __resetDeviceKey(); });

describe('device cookie', () => {
  it('rejects tampered / forged cookies', () => {
    const id = '33333333-3333-4333-8333-333333333333';
    const v = makeCookieValue(id, 'secret');
    expect(parseCookieValue(v)).toEqual({ id, secret: 'secret' });
    expect(parseCookieValue(v.replace('secret', 'secreT'))).toBeNull();
    expect(parseCookieValue(`${id}.secret.AAAA`)).toBeNull();
    expect(parseCookieValue('garbage')).toBeNull();
  });
  it('trusts only own, unrevoked device; revoking parent revokes handoff child', async () => {
    const db = fakeDb();
    const c = await createTrustedDevice(asDb(db), U, 'Safari · iPhone', 'approval');
    expect(await isTrustedDevice(asDb(db), U, c)).toBe(true);
    expect(await isTrustedDevice(asDb(db), OTHER, c)).toBe(false);
    const parentId = parseCookieValue(c)!.id;
    const child = await createTrustedDevice(asDb(db), U, 'x', 'handoff', parentId);
    expect(await isTrustedDevice(asDb(db), U, child)).toBe(true);
    await revokeDevice(asDb(db), U, parentId, 'test');
    expect(await isTrustedDevice(asDb(db), U, c)).toBe(false);
    expect(await isTrustedDevice(asDb(db), U, child)).toBe(false);
  });
});

describe('login approval', () => {
  it('is one-time and expires after 5 minutes', async () => {
    const db = fakeDb();
    const r = await startLoginRequest(asDb(db), U, 'l', 'IL');
    expect(await decideRequest(asDb(db), r.id, true, 'ops')).not.toBeNull();
    expect(await decideRequest(asDb(db), r.id, true, 'ops')).toBeNull(); // replay
    const req = await requestForPendingCookie(asDb(db), U, r.pendingCookie);
    expect(await consumeApproved(asDb(db), req!)).toBeTruthy();
    expect(await consumeApproved(asDb(db), { ...req!, status: 'approved' })).toBeNull(); // consumed once
    const r2 = await startLoginRequest(asDb(db), U, 'l', 'IL');
    db.tables.ops_login_requests.find((x) => x.id === r2.id)!.expires_at = new Date(Date.now() - 1000).toISOString();
    expect(await decideRequest(asDb(db), r2.id, true, 'ops')).toBeNull();
  });
  it('pending cookie of another user / forged is rejected', async () => {
    const db = fakeDb();
    const r = await startLoginRequest(asDb(db), U, 'l', 'IL');
    expect(await requestForPendingCookie(asDb(db), OTHER, r.pendingCookie)).toBeNull();
    expect(await requestForPendingCookie(asDb(db), U, makeCookieValue(r.id, 'wrong'))).toBeNull();
  });
  it('deny revokes all sessions', async () => {
    let revoked = '';
    const db = fakeDb({}, { ops_revoke_user_sessions: (a) => { revoked = String(a.p_user); return 2; } });
    const r = await startLoginRequest(asDb(db), U, 'l', 'IL');
    await decideRequest(asDb(db), r.id, false, 'telegram');
    expect(revoked).toBe(U);
  });
});

describe('email code', () => {
  it('locks after 5 wrong attempts and is single-use', async () => {
    const db = fakeDb();
    const r = await startLoginRequest(asDb(db), U, 'l', 'IL');
    const { code } = await createEmailChallenge(asDb(db), r.id);
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) expect((await redeemEmailCode(asDb(db), r.id, wrong)).ok).toBe(false);
    expect((await redeemEmailCode(asDb(db), r.id, code)).ok).toBe(false); // locked even with right code
    const r2 = await startLoginRequest(asDb(db), U, 'l', 'IL');
    const c2 = await createEmailChallenge(asDb(db), r2.id);
    expect((await redeemEmailCode(asDb(db), r2.id, c2.code)).ok).toBe(true);
    expect((await redeemEmailCode(asDb(db), r2.id, c2.code)).ok).toBe(false);
  });
  it('email link only works in the browser holding the pending cookie', async () => {
    const db = fakeDb();
    const r = await startLoginRequest(asDb(db), U, 'l', 'IL');
    const { token } = await createEmailChallenge(asDb(db), r.id);
    expect((await redeemEmailLink(asDb(db), U, token, null)).ok).toBe(false);
    expect((await redeemEmailLink(asDb(db), U, token, r.pendingCookie)).ok).toBe(true);
    expect((await redeemEmailLink(asDb(db), U, token, r.pendingCookie)).ok).toBe(false);
  });
});

describe('handoff', () => {
  async function setup() {
    const db = fakeDb({ profiles: [{ id: U, role: 'admin' }] });
    const c = await createTrustedDevice(asDb(db), U, 'l', 'approval');
    const dev = parseCookieValue(c)!.id;
    return { db, dev };
  }
  it('single use, 60s expiry, bound to client, needs live device + admin role', async () => {
    const { db, dev } = await setup();
    const t = await createHandoff(asDb(db), U, dev, hdr());
    expect((await claimHandoff(asDb(db), t, hdr())).ok).toBe(true);
    expect(await claimHandoff(asDb(db), t, hdr())).toEqual({ ok: false, reason: 'replay' });
    const t2 = await createHandoff(asDb(db), U, dev, hdr());
    expect(await claimHandoff(asDb(db), t2, hdr('curl/8', '9.9.9.9'))).toEqual({ ok: false, reason: 'client' });
    const t3 = await createHandoff(asDb(db), U, dev, hdr());
    expect(await claimHandoff(asDb(db), t3, hdr(), Date.now() + 61_000)).toEqual({ ok: false, reason: 'expired' });
    const t4 = await createHandoff(asDb(db), U, dev, hdr());
    db.tables.profiles[0].role = 'user';
    expect(await claimHandoff(asDb(db), t4, hdr())).toEqual({ ok: false, reason: 'role' });
    expect((await claimHandoff(asDb(db), `${t4.split('.')[0]}.forged`, hdr())).ok).toBe(false);
  });
});

describe('misc', () => {
  it('code format, labels, jwt session id', () => {
    expect(newCode()).toMatch(/^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/);
    expect(deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit Version/17 Safari/605')).toBe('Safari · iPhone');
    const sid = '44444444-4444-4444-8444-444444444444';
    const jwt = `x.${Buffer.from(JSON.stringify({ session_id: sid })).toString('base64url')}.y`;
    expect(sessionIdFromJwt(jwt)).toBe(sid);
    expect(sessionIdFromJwt('bad')).toBeNull();
  });
});
