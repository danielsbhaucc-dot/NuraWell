import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('@/lib/crypto/pii', () => ({ encryptString: (s: string) => s, decryptString: (s: string) => s }));
const { matchChoices, REQUEST_TTL_MS, sessionIdOf, sessionHash } = await import('@/lib/auth/stepup');

describe('QR approval anti-phishing', () => {
  it('request TTL is at most 2 minutes', () => expect(REQUEST_TTL_MS).toBeLessThanOrEqual(120_000));
  it('offers 3 distinct 2-digit choices including the real code', () => {
    for (let i = 0; i < 50; i++) {
      const c = matchChoices('42');
      expect(new Set(c).size).toBe(3);
      expect(c).toContain('42');
      for (const x of c) expect(x).toMatch(/^[0-9]{2}$/);
    }
  });
  it('binds to the auth session id from the access token', () => {
    const tok = `x.${Buffer.from(JSON.stringify({ session_id: 's-1' })).toString('base64url')}.y`;
    expect(sessionIdOf(tok)).toBe('s-1');
    expect(sessionIdOf('garbage')).toBeNull();
    expect(sessionHash('s-1')).not.toBe(sessionHash('s-2'));
    expect(sessionHash(null)).toBeNull();
  });
});

describe('number-match randomness', () => {
  it('codes are uniform-range 2-digit and the real code position is not fixed', async () => {
    const { matchCode } = await import('@/lib/auth/stepup');
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      const c = matchCode();
      expect(Number(c)).toBeGreaterThanOrEqual(10);
      expect(Number(c)).toBeLessThanOrEqual(99);
      seen.add(c);
    }
    expect(seen.size).toBeGreaterThan(80);
    const pos = [0, 0, 0];
    for (let i = 0; i < 600; i++) pos[matchChoices('42').indexOf('42')]++;
    for (const p of pos) expect(p).toBeGreaterThan(120);
  });
});
