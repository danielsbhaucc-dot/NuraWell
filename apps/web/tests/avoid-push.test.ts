import { describe, expect, it } from 'vitest';

import {
  buildCrisisCooldownPatch,
  isAvoidPushActive,
  pruneExpiredAvoidPushUntil,
} from '../lib/ai/avoid-push';

describe('avoid-push', () => {
  it('isAvoidPushActive when avoid_push true', () => {
    expect(isAvoidPushActive({ avoid_push: true })).toBe(true);
  });

  it('isAvoidPushActive when avoid_push_until in future', () => {
    const until = new Date(Date.now() + 3600000).toISOString();
    expect(isAvoidPushActive({ avoid_push_until: until })).toBe(true);
  });

  it('inactive when until expired', () => {
    const until = new Date(Date.now() - 3600000).toISOString();
    expect(isAvoidPushActive({ avoid_push_until: until })).toBe(false);
  });

  it('buildCrisisCooldownPatch sets future iso', () => {
    const patch = buildCrisisCooldownPatch(48);
    expect(patch.avoid_push_until).toBeTruthy();
    expect(new Date(patch.avoid_push_until!).getTime()).toBeGreaterThan(Date.now());
  });

  it('pruneExpiredAvoidPushUntil removes stale field', () => {
    const until = new Date(Date.now() - 1000).toISOString();
    const out = pruneExpiredAvoidPushUntil({ avoid_push_until: until, notes: 'x' });
    expect(out.avoid_push_until).toBeUndefined();
    expect(out.notes).toBe('x');
  });
});
