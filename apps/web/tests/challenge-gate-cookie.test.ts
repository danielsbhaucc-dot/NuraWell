import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CHALLENGE_GATE_TTL_MS,
  isNoChallengeGateValid,
  signNoChallengeGate,
} from '../lib/challenge/gate-cookie';

describe('challenge gate cookie', () => {
  const prev = process.env.CHALLENGE_GATE_COOKIE_SECRET;
  beforeEach(() => {
    process.env.CHALLENGE_GATE_COOKIE_SECRET = 'test-secret-0123456789abcdef';
  });
  afterEach(() => {
    process.env.CHALLENGE_GATE_COOKIE_SECRET = prev;
  });

  it('accepts a fresh cookie for the same user', async () => {
    const v = await signNoChallengeGate('u1');
    expect(await isNoChallengeGateValid(v!, 'u1')).toBe(true);
  });
  it('rejects another user, tampering, and expiry', async () => {
    const now = Date.now();
    const v = (await signNoChallengeGate('u1', now))!;
    expect(await isNoChallengeGateValid(v, 'u2', now)).toBe(false);
    expect(await isNoChallengeGateValid(v.slice(0, -1) + (v.endsWith('0') ? '1' : '0'), 'u1', now)).toBe(false);
    expect(await isNoChallengeGateValid(v, 'u1', now + CHALLENGE_GATE_TTL_MS + 1)).toBe(false);
    const [, sig] = v.split('.');
    expect(await isNoChallengeGateValid(`${now + 10 * CHALLENGE_GATE_TTL_MS}.${sig}`, 'u1', now)).toBe(false);
  });
  it('is disabled without a secret', async () => {
    process.env.CHALLENGE_GATE_COOKIE_SECRET = '';
    const sr = process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.SUPABASE_SERVICE_ROLE_KEY = '';
    expect(await signNoChallengeGate('u1')).toBeNull();
    expect(await isNoChallengeGateValid('1.abc', 'u1')).toBe(false);
    process.env.SUPABASE_SERVICE_ROLE_KEY = sr;
  });
});
