import { describe, expect, it } from 'vitest';
import { OPS_IDLE_MS, signOpsMfa, verifyOpsMfa } from '@/lib/auth/ops-mfa';

process.env.OPS_SESSION_SIGNING_KEY = 'x'.repeat(40);
describe('ops mfa cookie', () => {
  it('valid for the same user, rejects other user / tamper / idle / absolute', () => {
    const now = Date.now();
    const c = signOpsMfa('u1', now);
    expect(verifyOpsMfa(c, 'u1', now + 1000)).not.toBeNull();
    expect(verifyOpsMfa(c, 'u2', now)).toBeNull();
    expect(verifyOpsMfa(c.slice(0, -2) + 'aa', 'u1', now)).toBeNull();
    expect(verifyOpsMfa(c, 'u1', now + OPS_IDLE_MS + 1)).toBeNull();
    expect(verifyOpsMfa(signOpsMfa('u1', now + 11 * 3600_000, now), 'u1', now + 12 * 3600_000 + 1)).toBeNull();
  });
});
