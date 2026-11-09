import { describe, expect, it } from 'vitest';
import { CHALLENGE_ACCOUNT_PATHS, CHALLENGE_PUBLIC_INFO_PATHS, isChallengeLockedPath } from '@/lib/challenge/phase';

describe('challenge gate keeps legal and help pages open', () => {
  it.each([...CHALLENGE_PUBLIC_INFO_PATHS])('%s is not locked', (p) => {
    expect(isChallengeLockedPath(p)).toBe(false);
  });
  it.each([...CHALLENGE_ACCOUNT_PATHS, '/settings/privacy/export', '/profile/edit'])('account page %s is not locked', (p) => {
    expect(isChallengeLockedPath(p)).toBe(false);
  });
  it('keeps app pages locked', () => {
    for (const p of ['/home', '/journey', '/journey/3', '/lessons/x', '/progress', '/guides', '/summaries', '/settings/almog', '/settings/sos-moments', '/profiles', '/settings/privacy-x', '/privacy-x', '/termsx', '/api/v1/ai/chat']) {
      expect(isChallengeLockedPath(p)).toBe(true);
    }
  });
});
