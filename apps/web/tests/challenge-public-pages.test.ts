import { describe, expect, it } from 'vitest';
import { CHALLENGE_PUBLIC_INFO_PATHS, isChallengeLockedPath } from '@/lib/challenge/phase';

describe('challenge gate keeps legal and help pages open', () => {
  it.each([...CHALLENGE_PUBLIC_INFO_PATHS])('%s is not locked', (p) => {
    expect(isChallengeLockedPath(p)).toBe(false);
  });
  it('keeps app pages locked', () => {
    for (const p of ['/home', '/journey', '/profile', '/settings/privacy', '/privacy-x', '/termsx', '/api/v1/ai/chat']) {
      expect(isChallengeLockedPath(p)).toBe(true);
    }
  });
});
