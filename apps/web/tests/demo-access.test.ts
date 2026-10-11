import { describe, expect, it } from 'vitest';
import { buildDemoWelcomeHeadline, hebrewDayPartGreeting } from '../lib/demo-access/greeting';
import { hashDemoPassword, verifyDemoPassword } from '../lib/demo-access/password';
import { generateDemoAccessToken, hashDemoAccessToken, tokensMatch } from '../lib/demo-access/token';
import { parseDemoAccessCookie, signDemoAccessCookie } from '../lib/demo-access/cookie';

describe('demo-access greeting', () => {
  it('builds hebrew day-part greetings', () => {
    expect(hebrewDayPartGreeting(8)).toBe('בוקר טוב');
    expect(hebrewDayPartGreeting(13)).toBe('צהריים טובים');
    expect(hebrewDayPartGreeting(19)).toBe('ערב טוב');
    expect(hebrewDayPartGreeting(2)).toBe('לילה טוב');
  });

  it('includes guest name when provided', () => {
    expect(buildDemoWelcomeHeadline('דולב', 9)).toBe('בוקר טוב, דולב');
    expect(buildDemoWelcomeHeadline(null, 9)).toBe('בוקר טוב');
  });
});

describe('demo-access token + password', () => {
  it('hashes tokens consistently', () => {
    const token = generateDemoAccessToken();
    expect(token.length).toBeGreaterThan(20);
    const hash = hashDemoAccessToken(token);
    expect(tokensMatch(token, hash)).toBe(true);
    expect(tokensMatch(`${token}x`, hash)).toBe(false);
  });

  it('verifies scrypt passwords', () => {
    const stored = hashDemoPassword('temp-secret');
    expect(verifyDemoPassword('temp-secret', stored)).toBe(true);
    expect(verifyDemoPassword('wrong', stored)).toBe(false);
    expect(verifyDemoPassword('anything', null)).toBe(true);
  });
});

describe('demo-access cookie', () => {
  it('round-trips a signed cookie when secret exists', async () => {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.DEMO_ACCESS_COOKIE_SECRET) {
      process.env.DEMO_ACCESS_COOKIE_SECRET = 'test-demo-access-secret-key';
    }
    const expMs = Date.now() + 60_000;
    const value = await signDemoAccessCookie({
      linkId: '11111111-1111-1111-1111-111111111111',
      userId: '22222222-2222-2222-2222-222222222222',
      expMs,
      sessionEpoch: 1,
      guestName: 'דולב',
      reason: 'הדגמה למפתח',
    });
    expect(value).toBeTruthy();
    const parsed = await parseDemoAccessCookie(value!);
    expect(parsed?.guestName).toBe('דולב');
    expect(parsed?.reason).toBe('הדגמה למפתח');
    expect(parsed?.sessionEpoch).toBe(1);
  });
});
