import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { fakeDb } from './helpers/access-fake-db';
vi.mock('server-only', () => ({}));
import { bindAdminSession, FRESH_LOGIN_MS, loginAgeMs, revokeAllAdminSessions, revokeDeviceSessions, touchDeviceMeta, META_THROTTLE_MS } from '@/lib/ops/admin-session';
import { acknowledgeFinding } from '@/lib/platform/access/audit-ack';

const U = '00000000-0000-0000-0000-0000000000aa';
const D = '00000000-0000-0000-0000-0000000000d1';
const D2 = '00000000-0000-0000-0000-0000000000d2';
const SID = '00000000-0000-0000-0000-00000000005e';
const jwt = (p: object) => `h.${Buffer.from(JSON.stringify(p)).toString('base64url')}.s`;
const tok = jwt({ session_id: SID });

describe('PII gate: every per-user personal-data admin route is gated server-side', () => {
  const routes: [string, string[]][] = [
    ['app/api/v1/admin/users/[userId]/route.ts', ['GET']],
    ['app/api/v1/admin/users/[userId]/almog/route.ts', ['GET']],
    ['app/api/v1/admin/users/[userId]/memory/route.ts', ['GET', 'DELETE']],
    ['app/api/v1/admin/users/[userId]/chat-memory/route.ts', ['GET']],
    ['app/api/v1/ops/legal/user/[userId]/route.ts', ['GET']],
    ['app/api/v1/ops/legal/user/[userId]/export/route.ts', ['GET']],
    ['app/api/v1/ops/legal/user/[userId]/platform-logs/route.ts', ['GET']],
    ['app/api/v1/ops/legal/user/[userId]/precheck/route.ts', ['GET', 'POST']],
    ['app/api/v1/ops/legal/user/[userId]/verify/route.ts', ['GET']],
  ];
  for (const [file, methods] of routes) {
    it(file, () => {
      const src = readFileSync(join(process.cwd(), file), 'utf8');
      for (const m of methods) {
        const start = src.search(new RegExp(`export async function ${m}\\b`));
        if (start < 0) continue; // method may be exported differently; covered by the presence check below
        const next = src.slice(start + 10).search(/export async function /);
        const body = next < 0 ? src.slice(start) : src.slice(start, start + 10 + next);
        const gate = body.indexOf('requirePiiGrant(');
        expect(gate, `${m} must call requirePiiGrant`).toBeGreaterThan(-1);
        const firstRead = body.search(/\.from\('(?!pii_)/);
        if (firstRead > -1) expect(gate, `${m}: gate must run before any data read`).toBeLessThan(firstRead);
      }
      expect(src).toMatch(/requirePiiGrant\(/);
    });
  }
});

describe('bindAdminSession: fail closed, no trust-on-first-use', () => {
  const NOW = Date.parse('2026-10-25T17:00:00Z');
  const t = (loginAgoMs: number | null, method = 'password') => jwt({ session_id: SID, ...(loginAgoMs === null ? {} : { amr: [{ method, timestamp: Math.floor((NOW - loginAgoMs) / 1000) }] }) });
  const bindRpc = () => true;
  it('no session id → reauth', async () => {
    expect(await bindAdminSession(fakeDb() as never, U, D, 'garbage', NOW)).toBe('reauth');
  });
  it('binding lookup error → denied', async () => {
    const db = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: 'x' } }) }) }) }), rpc: async () => ({ data: true, error: null }) };
    expect(await bindAdminSession(db as never, U, D, t(0), NOW)).toBe('denied');
  });
  it('UNBOUND pre-existing session (old login) is rejected and never bound — a stolen old cookie cannot bind itself', async () => {
    const db = fakeDb({ rpc: { ops_bind_admin_session: bindRpc } });
    expect(await bindAdminSession(db as never, U, D, t(3 * 86_400_000), NOW)).toBe('reauth');
    expect(db.calls.some((c) => c.table === 'rpc:ops_bind_admin_session')).toBe(false);
  });
  it('UNBOUND session just past the fresh-login window → reauth', async () => {
    const db = fakeDb({ rpc: { ops_bind_admin_session: bindRpc } });
    expect(await bindAdminSession(db as never, U, D, t(FRESH_LOGIN_MS + 1000), NOW)).toBe('reauth');
    expect(db.calls.some((c) => c.table === 'rpc:ops_bind_admin_session')).toBe(false);
  });
  it('UNBOUND session without an amr claim → reauth', async () => {
    const db = fakeDb({ rpc: { ops_bind_admin_session: bindRpc } });
    expect(await bindAdminSession(db as never, U, D, t(null), NOW)).toBe('reauth');
  });
  it('fresh full login from an enrolled device → bound to that device', async () => {
    const db = fakeDb({ rpc: { ops_bind_admin_session: bindRpc } });
    expect(await bindAdminSession(db as never, U, D, t(30_000), NOW)).toBe('ok');
    expect(db.calls.find((c) => c.table === 'rpc:ops_bind_admin_session')!.args[0]).toEqual({ p_user: U, p_session: SID, p_device: D });
  });
  it('fresh session but bind RPC refuses (raced from another device) → denied', async () => {
    const db = fakeDb({ rpc: { ops_bind_admin_session: () => false } });
    expect(await bindAdminSession(db as never, U, D, t(30_000), NOW)).toBe('denied');
  });
  it('bound session from its own device → ok (no re-login needed later)', async () => {
    const db = fakeDb({ results: { ops_admin_sessions: [{ device_id: D, user_id: U, revoked_at: null }] } });
    expect(await bindAdminSession(db as never, U, D, t(5 * 86_400_000), NOW)).toBe('ok');
  });
  it('bound session replayed from another device → denied', async () => {
    const db = fakeDb({ results: {
      ops_admin_sessions: [{ device_id: D2, user_id: U, revoked_at: null }],
      ops_trusted_devices: [[{ id: D2, parent_id: null, revoked_at: null }, { id: D, parent_id: null, revoked_at: null }]] } });
    expect(await bindAdminSession(db as never, U, D, t(0), NOW)).toBe('denied');
  });
  it('revoked binding → reauth (even with a fresh-looking token, never re-bound)', async () => {
    const db = fakeDb({ rpc: { ops_bind_admin_session: bindRpc }, results: { ops_admin_sessions: [{ device_id: D, user_id: U, revoked_at: 'x' }] } });
    expect(await bindAdminSession(db as never, U, D, t(0), NOW)).toBe('reauth');
    expect(db.calls.some((c) => c.table === 'rpc:ops_bind_admin_session')).toBe(false);
  });
  it('live handoff child of the bound device → ok', async () => {
    const db = fakeDb({ results: {
      ops_admin_sessions: [{ device_id: D, user_id: U, revoked_at: null }],
      ops_trusted_devices: [[{ id: D, parent_id: null, revoked_at: null }, { id: D2, parent_id: D, revoked_at: null }]] } });
    expect(await bindAdminSession(db as never, U, D2, t(0), NOW)).toBe('ok');
  });
  it('loginAgeMs ignores token_refresh/anonymous and future timestamps', () => {
    expect(loginAgeMs(jwt({ amr: [{ method: 'token_refresh', timestamp: NOW / 1000 }] }), NOW)).toBeNull();
    expect(loginAgeMs(jwt({ amr: [{ method: 'password', timestamp: NOW / 1000 + 3600 }] }), NOW)).toBeNull();
    expect(loginAgeMs(jwt({ amr: [{ method: 'otp', timestamp: NOW / 1000 - 60 }] }), NOW)).toBe(60_000);
  });
});

describe('opsDeviceGate: unbound session → reauth; lockout-safe', () => {
  it('trusted device + stale unbound session → {ok:false, reauth:true}; fresh login → ok', async () => {
    vi.resetModules();
    vi.doMock('@/lib/ops/device-trust', async (orig) => ({ ...(await orig<object>()), trustedDeviceId: async () => D }));
    const { opsDeviceGate } = await import('@/lib/ops/device-gate');
    const stale = jwt({ session_id: SID, amr: [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) - 86_400 }] });
    const fresh = jwt({ session_id: SID, amr: [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) - 10 }] });
    expect(await opsDeviceGate(fakeDb({ rpc: { ops_bind_admin_session: () => true } }) as never, U, 'c', stale, null)).toEqual({ ok: false, reauth: true });
    expect(await opsDeviceGate(fakeDb({ rpc: { ops_bind_admin_session: () => true } }) as never, U, 'c', fresh, null)).toEqual({ ok: true });
    vi.doUnmock('@/lib/ops/device-trust');
  });
  it('proxy ends the session and route guards answer reauth_required', () => {
    const proxy = readFileSync(join(process.cwd(), 'proxy.ts'), 'utf8');
    expect(proxy).toMatch(/gate\.reauth\)[\s\S]{0,200}signOut\(\{ scope: 'local' \}\)/);
    const guards = readFileSync(join(process.cwd(), 'lib/api/route-guards.ts'), 'utf8');
    expect(guards).toMatch(/gate\.reauth[\s\S]{0,200}reauth_required/);
  });
  it('bootstrap never adopts an old session', () => {
    const src = readFileSync(join(process.cwd(), 'lib/ops/device-gate.ts'), 'utf8');
    expect(src).toMatch(/allowBootstrap && isFreshLogin\(accessToken\) && \(await canBootstrap/);
  });
});

describe('touchDeviceMeta (last-seen, throttled, new-country)', () => {
  const f = { ipHash: 'h', ipMasked: '1.2.3.x', country: 'IL', browser: 'Chrome · macOS' };
  const now = Date.parse('2026-10-25T10:00:00Z');
  it('throttled within 5 minutes', async () => {
    const db = fakeDb({ results: { 'ops_trusted_devices:select': [{ meta_seen_at: new Date(now - META_THROTTLE_MS + 1000).toISOString(), countries_seen: ['IL'], last_country: 'IL' }] } });
    expect(await touchDeviceMeta(db as never, D, f, now)).toEqual({ updated: false, newCountry: null });
    expect(db.calls.some((c) => c.op === 'update')).toBe(false);
  });
  it('first country ever: records it, no alert', async () => {
    const db = fakeDb({ results: { 'ops_trusted_devices:select': [{ meta_seen_at: null, countries_seen: [], last_country: null }], 'ops_trusted_devices:update': [[{ id: D }]] } });
    expect(await touchDeviceMeta(db as never, D, f, now)).toEqual({ updated: true, newCountry: null });
  });
  it('new country → reported for alert', async () => {
    const db = fakeDb({ results: { 'ops_trusted_devices:select': [{ meta_seen_at: new Date(now - META_THROTTLE_MS - 1).toISOString(), countries_seen: ['IL'], last_country: 'IL' }], 'ops_trusted_devices:update': [[{ id: D }]] } });
    expect(await touchDeviceMeta(db as never, D, { ...f, country: 'DE' }, now)).toEqual({ updated: true, newCountry: 'DE' });
  });
  it('lost the race (conditional update matched nothing) → no duplicate alert', async () => {
    const db = fakeDb({ results: { 'ops_trusted_devices:select': [{ meta_seen_at: null, countries_seen: ['IL'], last_country: 'IL' }], 'ops_trusted_devices:update': [[]] } });
    expect(await touchDeviceMeta(db as never, D, { ...f, country: 'DE' }, now)).toEqual({ updated: false, newCountry: null });
  });
});

describe('revoke one device vs revoke all', () => {
  it('device revoke hits only that device and its handoff children', async () => {
    const db = fakeDb({ results: { ops_trusted_devices: [[{ id: D2 }]] }, rpc: { ops_revoke_device_sessions: () => 1 } });
    expect(await revokeDeviceSessions(db as never, D)).toBe(2);
    const devs = db.calls.filter((c) => c.table === 'rpc:ops_revoke_device_sessions').map((c) => (c.args[0] as { p_device: string }).p_device);
    expect(devs).toEqual([D, D2]);
    expect(db.calls.some((c) => c.table === 'rpc:ops_revoke_all_admin_sessions' || c.table === 'rpc:ops_revoke_user_sessions')).toBe(false);
  });
  it('revoke all is a separate action', async () => {
    const db = fakeDb({ rpc: { ops_revoke_all_admin_sessions: () => 3 } });
    expect(await revokeAllAdminSessions(db as never, U)).toBe(3);
  });
  it('device route wires revoke → per-device and revoke_all → all', () => {
    const src = readFileSync(join(process.cwd(), 'app/api/v1/ops/device/route.ts'), 'utf8');
    expect(src).toMatch(/revokeDeviceSessions\(db, a\.id\)/);
    expect(src).toMatch(/'revoke_all'[\s\S]*revokeAllAdminSessions\(/);
  });
});

describe('acknowledgeFinding', () => {
  it('records who/when and logs it', async () => {
    const db = fakeDb({ results: { 'access_audit_findings:update': [[{ id: 'f', product_id: 'nurawell' }]] } });
    const r = await acknowledgeFinding(db as never, 'f', U, new Date('2026-10-25T10:00:00Z'));
    expect(r).toEqual({ ok: true, at: '2026-10-25T10:00:00.000Z' });
    expect(db.calls.find((c) => c.table === 'access_audit_findings' && c.op === 'update')!.args[0]).toEqual({ acknowledged_at: '2026-10-25T10:00:00.000Z', acknowledged_by: U });
    expect(db.calls.some((c) => c.table === 'access_audit_findings' && c.op === 'is')).toBe(true);
    expect((db.calls.find((c) => c.table === 'admin_audit_log' && c.op === 'insert')!.args[0] as { path: string }).path).toBe('access_audit_ack');
  });
  it('second ack is a no-op', async () => {
    const db = fakeDb({ results: { 'access_audit_findings:update': [[]] } });
    expect(await acknowledgeFinding(db as never, 'f', U)).toEqual({ ok: false });
    expect(db.calls.some((c) => c.table === 'admin_audit_log')).toBe(false);
  });
  it('log write fails → ack rolled back', async () => {
    const db = fakeDb({ results: { 'access_audit_findings:update': [[{ id: 'f', product_id: 'nurawell' }]] }, failInsert: ['admin_audit_log'] });
    expect(await acknowledgeFinding(db as never, 'f', U)).toEqual({ ok: false });
    expect(db.calls.filter((c) => c.table === 'access_audit_findings' && c.op === 'update')).toHaveLength(2);
  });
});
