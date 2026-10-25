import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ admin: false, stepUp: false }));
vi.mock('@/lib/api/route-guards', () => ({
  requireApiAdmin: async () => state.admin
    ? { ok: true, user: { id: '11111111-1111-4111-8111-111111111111' }, supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'x.e30.y' } } }) } } }
    : { ok: false, response: new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }) },
}));
vi.mock('@/lib/ops/sensitive-stepup', () => ({ hasSensitiveStepUp: async () => state.stepUp }));
const dbCalls: string[] = [];
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => new Proxy({}, { get: (_t, k) => { dbCalls.push(String(k)); throw new Error('db must not be touched'); } }),
}));
vi.mock('@/lib/api/rate-limit', () => ({ consumeRateLimit: async () => ({ ok: true }), rateLimitResponse: () => new Response(null, { status: 429 }) }));

import * as main from '@/app/api/v1/ops/security/route';
import * as inv from '@/app/api/v1/ops/security/investigate/route';
import * as rec from '@/app/api/v1/ops/security/recover/route';
import * as test from '@/app/api/v1/ops/security/test-alert/route';
import { cidrContains, lockdownDecision, parseTarget, untilFrom, type Lockdown } from '@/lib/security/ir';
import { verdictFor, type Facts } from '@/lib/security/investigate';
import { macFor, verifyToken } from '@/lib/security/tg-actions';

const req = (method: string, path = '/api/v1/ops/security', body?: unknown) =>
  new Request(`https://ops.test${path}`, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
const ROUTES: Array<[string, (r: Request) => Promise<Response>, Request]> = [
  ['GET state', main.GET, req('GET')],
  ['POST action', main.POST, req('POST', '/api/v1/ops/security', { op: 'revoke_session', session: '22222222-2222-4222-8222-222222222222' })],
  ['GET investigate', inv.GET, req('GET', '/api/v1/ops/security/investigate?session=22222222-2222-4222-8222-222222222222')],
  ['POST recover', rec.POST, req('POST', '/api/v1/ops/security/recover', { action: 'lift_lockdown', code: 'ABCDE-FGHIJ' })],
  ['POST test-alert', test.POST, req('POST', '/api/v1/ops/security/test-alert')],
];

beforeEach(() => { state.admin = false; state.stepUp = false; dbCalls.length = 0; });

describe('incident-response routes', () => {
  it.each(ROUTES)('%s: non-admin gets 403', async (_n, h, r) => {
    const res = await h(r.clone());
    expect(res.status).toBe(403);
    expect(dbCalls).toEqual([]);
  });
  it.each(ROUTES)('%s: admin without step-up is refused', async (_n, h, r) => {
    state.admin = true;
    const res = await h(r.clone());
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: 'stepup_required', stepUp: true });
    expect(dbCalls).toEqual([]);
  });
});

describe('ir helpers', () => {
  it('parses targets and refuses huge ranges', () => {
    expect(parseTarget('1.2.3.4')).toEqual({ kind: 'ip', ip: '1.2.3.4' });
    expect(parseTarget('1.2.0.0/16')).toEqual({ kind: 'range', cidr: '1.2.0.0/16' });
    expect(parseTarget('1.0.0.0/8')).toBeNull();
    expect(parseTarget('2001:db8::/32')).toEqual({ kind: 'range', cidr: '2001:db8::/32' });
    expect(parseTarget('nope')).toBeNull();
    expect(cidrContains('10.1.0.0/16', '10.1.2.3')).toBe(true);
    expect(cidrContains('10.1.0.0/16', '10.2.0.1')).toBe(false);
    expect(untilFrom(null)).toBe('infinity');
  });
  const ld = (o: Partial<Lockdown>): Lockdown => ({ active: true, started_at: null, started_by: null, keep_session: null, allow_ip_hash: null, allowlist_until: null, ended_at: null, ended_via: null, ...o });
  it('lockdown: step-up everywhere, IP allowlist with expiry, recovery paths exempt', () => {
    expect(lockdownDecision(ld({ active: false }), { path: '/api/v1/ops/x', ipHash: 'a', steppedUp: false })).toBeNull();
    expect(lockdownDecision(ld({}), { path: '/api/v1/ops/x', ipHash: 'a', steppedUp: false })?.code).toBe('lockdown_stepup');
    expect(lockdownDecision(ld({}), { path: '/api/v1/ops/x', ipHash: 'a', steppedUp: true })).toBeNull();
    const until = new Date(Date.now() + 3_600_000).toISOString();
    expect(lockdownDecision(ld({ allow_ip_hash: 'mine', allowlist_until: until }), { path: '/api/v1/ops/x', ipHash: 'other', steppedUp: true })?.code).toBe('lockdown_ip');
    expect(lockdownDecision(ld({ allow_ip_hash: 'mine', allowlist_until: until }), { path: '/api/v1/ops/x', ipHash: 'mine', steppedUp: true })).toBeNull();
    expect(lockdownDecision(ld({ allow_ip_hash: 'mine', allowlist_until: new Date(Date.now() - 1000).toISOString() }), { path: '/api/v1/ops/x', ipHash: 'other', steppedUp: true })).toBeNull();
    for (const p of ['/api/v1/ops/stepup', '/api/v1/ops/device', '/api/v1/ops/security/recover']) expect(lockdownDecision(ld({ allow_ip_hash: 'mine', allowlist_until: until }), { path: p, ipHash: 'other', steppedUp: false })).toBeNull();
  });
});

describe('telegram alert buttons', () => {
  it('signed tokens verify only for their own kind and key', () => {
    const id = 'abcdefghijklmnop';
    const t = `${id}.${macFor('sx', id, 'k1')}`;
    expect(verifyToken('sx', t, 'k1')).toBe(id);
    expect(verifyToken('sk', t, 'k1')).toBeNull();
    expect(verifyToken('sx', t, 'k2')).toBeNull();
    expect(verifyToken('sx', `${id}.${'A'.repeat(22)}`, 'k1')).toBeNull();
    expect(`ceo:sx:${t}`.length).toBeLessThanOrEqual(64);
  });
});

describe('verdict', () => {
  const base: Facts = { sessionMethods: ['password'], aal: 'aal1', failsBefore: 0, newDevice: false, newCountry: false, knownPlace: false, exports: 0, sensitiveRoutes: 0, routes: 3, refreshedOld: false, isAdmin: true, activeSessions: 1 };
  it('password guessing from a new country with exports is high', () => {
    const v = verdictFor({ ...base, failsBefore: 12, newCountry: true, exports: 2 });
    expect(v.level).toBe('high');
    expect(v.headline).toMatch(/חדירה/);
    expect(v.reasons.join(' ')).toMatch(/ניחוש סיסמה/);
    expect(v.next.join(' ')).toMatch(/נעילת חירום/);
  });
  it('known place with MFA is low', () => {
    expect(verdictFor({ ...base, sessionMethods: ['password', 'totp'], aal: 'aal2', knownPlace: true }).level).toBe('low');
  });
});
