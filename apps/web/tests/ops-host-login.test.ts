import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const state: { user: { id: string; email_confirmed_at: string } | null; role: string | null; trusted: boolean } = { user: null, role: null, trusted: false };
const signOut = vi.fn(() => Promise.resolve({ error: null }));

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getUser: () => Promise.resolve({ data: { user: state.user } }), getSession: () => Promise.resolve({ data: { session: null } }), signOut },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: state.role ? { role: state.role } : null }) }) }),
    }),
  }),
}));
vi.mock('../lib/demo-access/active-session', () => ({
  hasActiveDemoAccessSession: () => Promise.resolve(false),
  killDeadDemoAuthSessions: () => Promise.resolve(undefined),
}));

vi.mock('../lib/ops/device-gate', () => ({
  isDeviceCheckPath: (p: string) => p === '/device-check',
  opsDeviceGate: () => Promise.resolve({ ok: state.trusted }),
}));
vi.mock('../lib/supabase/admin', () => ({ createAdminClient: () => ({}) }));

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
process.env.NEXT_PUBLIC_OPS_HOSTNAME = 'ops.nurawell.ai';

const { proxy } = await import('../proxy');
const { safeOpsReturnPath } = await import('../lib/ops-host');

const req = (path: string) =>
  new NextRequest(`https://ops.nurawell.ai${path}`, { headers: { host: 'ops.nurawell.ai' } });

const isGeneric404 = (res: Response) =>
  res.headers.get('location') === null && (res.headers.get('x-middleware-rewrite') ?? '').endsWith('/__nf');

describe('Ops stealth: no login page, generic 404 without admin + trusted device', () => {
  beforeEach(() => {
    state.user = null;
    state.role = null;
    state.trusted = false;
    signOut.mockClear();
  });

  it.each(['/', '/ceo?x=1', '/users', '/login', '/login?redirect=%2Fceo', '/device-check', '/random-xyz'])('anonymous %s → generic 404, no redirect', async (p) => {
    expect(isGeneric404(await proxy(req(p)))).toBe(true);
  });

  it('non-admin → generic 404 (no hint, no login bounce)', async () => {
    state.user = { id: 'u2', email_confirmed_at: 'now' };
    state.role = 'user';
    for (const p of ['/', '/ceo', '/login']) expect(isGeneric404(await proxy(req(p)))).toBe(true);
  });

  it('admin on an untrusted device → generic 404', async () => {
    state.user = { id: 'u1', email_confirmed_at: 'now' };
    state.role = 'admin';
    expect(isGeneric404(await proxy(req('/ceo')))).toBe(true);
  });

  it('admin + trusted device → panel (rewritten to /ops)', async () => {
    state.user = { id: 'u1', email_confirmed_at: 'now' };
    state.role = 'admin';
    state.trusted = true;
    const res = await proxy(req('/ceo'));
    expect(res.headers.get('x-middleware-rewrite') ?? '').toContain('/ops/ceo');
  });

  it('no response ever points at *.vercel.app', async () => {
    for (const p of ['/', '/ceo', '/users', '/register', '/guides']) {
      const res = await proxy(req(p));
      expect(res.headers.get('location') ?? '').not.toContain('vercel.app');
    }
  });
});

describe('safeOpsReturnPath', () => {
  it.each([
    [null, '/'],
    ['/ceo', '/ceo'],
    ['//evil.com', '/'],
    ['/\\evil.com', '/'],
    ['https://evil.com', '/'],
    ['/login?redirect=/x', '/'],
  ])('%s → %s', (raw, out) => expect(safeOpsReturnPath(raw)).toBe(out));
});
