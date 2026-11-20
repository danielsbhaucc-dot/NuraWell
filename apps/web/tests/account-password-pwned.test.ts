import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/monitoring/report-error', () => ({ reportEvent: vi.fn(async () => undefined) }));
vi.mock('@/lib/api/rate-limit', () => ({ consumeRateLimit: vi.fn(async () => ({ ok: true })) }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u1', email: 'member@example.test' } } }) } }),
}));
const updateUserById = vi.fn(async () => ({ error: null }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ auth: { admin: { updateUserById } } }) }));

import { changePassword } from '@/lib/central/parent-password-change';
import { PASSWORD_ERRORS } from '@/lib/auth/password-policy';

/** A synthetic password: never a real one, built so it passes length/letter/digit rules. */
const NEXT_PW = 'Synthetic-pass-4821';
const SHA = createHash('sha1').update(NEXT_PW).digest('hex').toUpperCase();
const PREFIX = SHA.slice(0, 5);
const SUFFIX = SHA.slice(5);

const req = () =>
  new NextRequest('https://nurawell.test/api/v1/account/password', {
    method: 'POST',
    headers: { origin: 'https://nurawell.test', 'content-type': 'application/json' },
    body: JSON.stringify({ current: 'Old-synthetic-pass-1', password: NEXT_PW }),
  });

type Call = { url: string; init?: RequestInit };
let calls: Call[];
function stubFetch(hibp: () => Promise<Response>) {
  calls = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    calls.push({ url: u, init });
    if (u.startsWith('https://api.pwnedpasswords.com/range/')) return hibp();
    return new Response(JSON.stringify({ ok: true }), { status: 200 }); // the parent /id/password/set/
  }));
}

beforeEach(() => {
  process.env.PLATFORM_ID_CLIENT_SECRET = 'x'.repeat(40); // dummy, length only
  updateUserById.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

describe('account password change: leaked-password check (HIBP k-anonymity)', () => {
  it('a leaked password is refused in Hebrew, before the parent or the local copy is touched', async () => {
    stubFetch(async () => new Response(`${SUFFIX}:42\r\nAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:0`, { status: 200 }));
    const res = await changePassword(req());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'password', message: PASSWORD_ERRORS.pwned });
    expect(PASSWORD_ERRORS.pwned).toMatch(/[\u0590-\u05FF]/);
    expect(PASSWORD_ERRORS.pwned).not.toMatch(/בחרו|נסו|תבחרו/); // singular, no plural address
    expect(calls.map((c) => c.url)).toEqual([`https://api.pwnedpasswords.com/range/${PREFIX}`]);
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it('only the 5-char prefix leaves the server, with Add-Padding; never the password or the full hash', async () => {
    stubFetch(async () => new Response('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:0', { status: 200 }));
    const res = await changePassword(req());
    expect(res.status).toBe(200);
    const hibp = calls.find((c) => c.url.includes('pwnedpasswords'))!;
    expect(new Headers(hibp.init?.headers).get('Add-Padding')).toBe('true');
    expect(hibp.url).not.toContain(SUFFIX);
    expect(hibp.url).not.toContain(NEXT_PW);
    // The padded "count 0" entries are not a hit, so the change goes on to the parent and then the local copy.
    expect(calls.some((c) => c.url.includes('/id/password/set/'))).toBe(true);
    expect(updateUserById).toHaveBeenCalledOnce();
  });

  it('fails open when HIBP times out: the change still goes through, and nothing secret is logged', async () => {
    const spies = (['log', 'info', 'warn', 'error'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    stubFetch(async () => { throw new DOMException('timed out', 'TimeoutError'); });
    const res = await changePassword(req());
    expect(res.status).toBe(200);
    expect(spies[2]).toHaveBeenCalled(); // warn: hibp_unavailable_fail_open
    const dump = JSON.stringify(spies.flatMap((s) => s.mock.calls));
    for (const secret of [NEXT_PW, SHA, SUFFIX]) expect(dump).not.toContain(secret);
    spies.forEach((s) => s.mockRestore());
  });
});
