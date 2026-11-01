import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const user = { id: null as string | null };
const pwned = vi.fn<(p: string) => Promise<boolean | null>>();
const rl = vi.fn(() => Promise.resolve({ ok: true }));
const report = vi.fn(() => Promise.resolve());
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: () => Promise.resolve({ auth: { getUser: () => Promise.resolve({ data: { user: user.id ? { id: user.id } : null } }) } }) }));
vi.mock('@/lib/auth/password-policy', () => ({ isPwnedPassword: (p: string) => pwned(p) }));
vi.mock('@/lib/api/rate-limit', () => ({ consumeRateLimit: () => rl() }));
vi.mock('@/lib/monitoring/report-error', () => ({ reportEvent: (...a: unknown[]) => report(...(a as [])) }));

import { POST, GET } from '../app/api/v1/auth/signin-password-check/route';

const req = (body: unknown, q = '') => new Request(`https://x.test/api/v1/auth/signin-password-check${q}`, { method: 'POST', body: JSON.stringify(body) });

beforeEach(() => { user.id = 'u1'; pwned.mockReset(); rl.mockClear(); report.mockClear(); });

describe('S5 sign-in leaked-password check', () => {
  it('requires a real session (no anonymous HIBP oracle)', async () => {
    user.id = null;
    const res = await POST(req({ password: 'whatever12345' }));
    expect(res.status).toBe(401); expect(pwned).not.toHaveBeenCalled();
  });
  it('reports pwned and logs an event without the password', async () => {
    pwned.mockResolvedValue(true);
    const res = await POST(req({ password: 'password1234' }));
    expect(await res.json()).toEqual({ ok: true, pwned: true });
    expect(report).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(report.mock.calls)).not.toContain('password1234');
    expect(res.headers.get('cache-control')).toContain('no-store');
  });
  it('clean password', async () => {
    pwned.mockResolvedValue(false);
    expect(await (await POST(req({ password: 'Zq8!long-unique-pass' }))).json()).toEqual({ ok: true, pwned: false });
    expect(report).not.toHaveBeenCalled();
  });
  it('fails open when HIBP is unavailable', async () => {
    pwned.mockResolvedValue(null);
    expect(await (await POST(req({ password: 'abc123456789' }))).json()).toEqual({ ok: true, pwned: null });
  });
  it('rejects a password in the URL and bad bodies', async () => {
    expect((await POST(req({ password: 'x' }, '?password=x'))).status).toBe(400);
    expect((await POST(req({ password: 5 }))).status).toBe(400);
    expect((await POST(req({ password: 'a'.repeat(129) }))).status).toBe(400);
    expect(pwned).not.toHaveBeenCalled();
  });
  it('rate-limited → no lookup, still never blocks login', async () => {
    rl.mockResolvedValueOnce({ ok: false } as never);
    expect(await (await POST(req({ password: 'password1234' }))).json()).toEqual({ ok: true, pwned: null });
    expect(pwned).not.toHaveBeenCalled();
  });
  it('GET is 405', () => { expect(GET().status).toBe(405); });
  it('login page calls the check only after a successful sign-in and never blocks it', () => {
    const src = readFileSync(join(__dirname, '..', 'app/(auth)/login/page.tsx'), 'utf8');
    const callAt = src.indexOf('await warnIfLeaked('), errAt = src.indexOf('if (authError)');
    expect(callAt).toBeGreaterThan(errAt);
    expect(src).toMatch(/AbortController/);
  });
});
