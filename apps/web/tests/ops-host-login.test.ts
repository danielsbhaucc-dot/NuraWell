import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const state: { user: { id: string; email_confirmed_at: string } | null; role: string | null } = { user: null, role: null };
const signOut = vi.fn(async () => ({ error: null }));

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }), signOut },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.role ? { role: state.role } : null }) }) }),
    }),
  }),
}));
vi.mock('../lib/demo-access/active-session', () => ({
  hasActiveDemoAccessSession: async () => false,
  killDeadDemoAuthSessions: async () => undefined,
}));

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
process.env.NEXT_PUBLIC_OPS_HOSTNAME = 'ops.nurawell.ai';

const { proxy } = await import('../proxy');
const { safeOpsReturnPath } = await import('../lib/ops-host');

const req = (path: string) =>
  new NextRequest(`https://ops.nurawell.ai${path}`, { headers: { host: 'ops.nurawell.ai' } });

describe('Ops host login stays on ops.nurawell.ai', () => {
  beforeEach(() => {
    state.user = null;
    state.role = null;
    signOut.mockClear();
  });

  it('unauthenticated panel page → same-host /login with relative redirect', async () => {
    const res = await proxy(req('/ceo?x=1'));
    expect(res.status).toBe(307);
    const loc = new URL(res.headers.get('location')!);
    expect(loc.origin).toBe('https://ops.nurawell.ai');
    expect(loc.pathname).toBe('/login');
    expect(loc.searchParams.get('redirect')).toBe('/ceo?x=1');
  });

  it('/login on Ops host renders (not rewritten, not bounced)', async () => {
    const res = await proxy(req('/login?redirect=%2Fceo'));
    expect(res.headers.get('location')).toBeNull();
    expect(res.headers.get('x-middleware-rewrite')).toBeNull();
    expect(res.headers.get('x-robots-tag')).toContain('noindex');
  });

  it('admin on /login → back to the requested panel path on the same host', async () => {
    state.user = { id: 'u1', email_confirmed_at: 'now' };
    state.role = 'admin';
    const res = await proxy(req('/login?redirect=%2Fceo'));
    expect(res.headers.get('location')).toBe('https://ops.nurawell.ai/ceo');
  });

  it('admin on /login with a foreign redirect → panel home', async () => {
    state.user = { id: 'u1', email_confirmed_at: 'now' };
    state.role = 'admin';
    const res = await proxy(req('/login?redirect=%2F%2Fevil.com'));
    expect(res.headers.get('location')).toBe('https://ops.nurawell.ai/');
  });

  it('non-admin on a panel page → same-host /login?reason=no_access (no public-app bounce)', async () => {
    state.user = { id: 'u2', email_confirmed_at: 'now' };
    state.role = 'user';
    const res = await proxy(req('/'));
    const loc = new URL(res.headers.get('location')!);
    expect(loc.origin).toBe('https://ops.nurawell.ai');
    expect(loc.pathname + loc.search).toBe('/login?reason=no_access');
  });

  it('non-admin on /login?reason=no_access → signed out locally, page renders', async () => {
    state.user = { id: 'u2', email_confirmed_at: 'now' };
    state.role = 'user';
    const res = await proxy(req('/login?reason=no_access'));
    expect(res.headers.get('location')).toBeNull();
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
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
