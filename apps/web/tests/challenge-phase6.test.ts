import { describe, expect, it } from 'vitest';
import { challengeFadeUp, challengeCelebrationProps, challengeTransition } from '@/lib/challenge/motion';
import { challengeAllowedPaths } from '@/lib/challenge/phase';

describe('challenge motion helpers', () => {
  it('zero duration when reduced motion', () => {
    expect(challengeTransition(true).duration).toBe(0);
    expect(challengeFadeUp(true).transition.duration).toBe(0);
  });

  it('animated when motion allowed', () => {
    expect(challengeTransition(false).duration).toBeGreaterThan(0);
    expect(challengeCelebrationProps(false).initial).not.toBe(false);
  });
});

describe('challengeAllowedPaths notifications API', () => {
  it('includes notifications API during active phase', () => {
    const paths = challengeAllowedPaths('active');
    expect(paths.some((p) => p.includes('notifications'))).toBe(true);
    expect(paths.some((p) => p.includes('push'))).toBe(true);
  });
});
