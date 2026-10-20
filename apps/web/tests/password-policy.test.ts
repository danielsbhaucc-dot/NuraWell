import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/monitoring/report-error', () => ({ reportEvent: vi.fn(() => Promise.resolve()) }));

import { reportEvent } from '@/lib/monitoring/report-error';
import { checkPasswordPolicy, isPwnedPassword, PASSWORD_ERRORS } from '@/lib/auth/password-policy';

const PW = 'password1234';
const SHA = createHash('sha1').update(PW).digest('hex').toUpperCase();
const PREFIX = SHA.slice(0, 5);
const SUFFIX = SHA.slice(5);

function mockFetch(body: string, status = 200) {
  return vi.fn(async (_url: string, _init?: RequestInit) => new Response(body, { status })) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

afterEach(() => vi.restoreAllMocks());

describe('isPwnedPassword', () => {
  it('sends only the 5-char prefix with Add-Padding and no-store', async () => {
    const f = mockFetch(`${SUFFIX}:42\r\nABCDEF0123456789ABCDEF0123456789ABC:0`);
    expect(await isPwnedPassword(PW, f)).toBe(true);
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://api.pwnedpasswords.com/range/${PREFIX}`);
    expect(url).not.toContain(SUFFIX);
    expect(url).not.toContain(PW);
    expect((init.headers as Record<string, string>)['Add-Padding']).toBe('true');
    expect(init.cache).toBe('no-store');
    expect(init.method).toBe('GET');
  });
  it('treats padding entries (count 0) as not found', async () => {
    expect(await isPwnedPassword(PW, mockFetch(`${SUFFIX}:0\r\n`))).toBe(false);
  });
  it('not found', async () => {
    expect(await isPwnedPassword(PW, mockFetch('0000000000000000000000000000000000A:3'))).toBe(false);
  });
  it('returns null on HTTP error', async () => {
    expect(await isPwnedPassword(PW, mockFetch('', 503))).toBeNull();
  });
  it('returns null on timeout (abort)', async () => {
    vi.useFakeTimers();
    const f = vi.fn((_u: string, init?: RequestInit) => new Promise<Response>((_r, rej) => {
      init?.signal?.addEventListener('abort', () => rej(new Error('aborted')));
    })) as unknown as typeof fetch;
    const p = isPwnedPassword(PW, f);
    await vi.advanceTimersByTimeAsync(2001);
    expect(await p).toBeNull();
    vi.useRealTimers();
  });
});

describe('checkPasswordPolicy', () => {
  it('rejects passwords without a digit or without a letter', async () => {
    const f = vi.fn();
    expect((await checkPasswordPolicy('onlylettersxx', { source: 't', fetchImpl: f as unknown as typeof fetch })).ok).toBe(false);
    expect((await checkPasswordPolicy('1234567890', { source: 't', fetchImpl: f as unknown as typeof fetch })).ok).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });

  it('rejects < 8 chars without calling the API', async () => {
    const f = mockFetch('');
    const r = await checkPasswordPolicy('short7!', { source: 't', fetchImpl: f });
    expect(r).toMatchObject({ ok: false, reason: 'too_short', error: PASSWORD_ERRORS.tooShort });
    expect(f).not.toHaveBeenCalled();
  });
  it('rejects pwned with Hebrew error', async () => {
    const r = await checkPasswordPolicy(PW, { source: 't', fetchImpl: mockFetch(`${SUFFIX}:9`) });
    expect(r).toMatchObject({ ok: false, reason: 'pwned' });
    if (!r.ok) expect(r.error).toMatch(/[\u0590-\u05FF]/);
  });
  it('fails open on failure and logs warn with no password/hash material anywhere', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    const f = vi.fn(async () => { throw new Error('net'); }) as unknown as typeof fetch;
    const r = await checkPasswordPolicy(PW, { source: 'signup', fetchImpl: f });
    expect(r).toEqual({ ok: true, hibp: 'unavailable' });
    expect(reportEvent).toHaveBeenCalledWith('hibp_unavailable_fail_open', { source: 'signup' }, 'warning');
    const dump = JSON.stringify([...spies.flatMap((s) => s.mock.calls), (reportEvent as ReturnType<typeof vi.fn>).mock.calls]);
    for (const secret of [PW, SHA, SHA.toLowerCase(), SUFFIX, PREFIX]) expect(dump).not.toContain(secret);
    expect(spies[2]).toHaveBeenCalled();
  });
  it('found and not-found take similar (padded) time', async () => {
    const t0 = Date.now();
    await checkPasswordPolicy(PW, { source: 't', fetchImpl: mockFetch(`${SUFFIX}:9`) });
    const a = Date.now() - t0;
    const t1 = Date.now();
    await checkPasswordPolicy(PW, { source: 't', fetchImpl: mockFetch('') });
    const b = Date.now() - t1;
    expect(a).toBeGreaterThanOrEqual(295);
    expect(b).toBeGreaterThanOrEqual(295);
    expect(Math.abs(a - b)).toBeLessThan(60);
  });
});
