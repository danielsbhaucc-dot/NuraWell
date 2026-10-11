import { describe, expect, it } from 'vitest';
import { parseOnboardingCheckInPayload } from '../lib/workflows/onboarding-check-in-payload';

const base = { userId: '11111111-1111-4111-8111-111111111111', checkInTime: '21:30', checkpointDate: '2026-10-11' };

describe('onboarding check-in payload', () => {
  it('accepts personal check-in indexes beyond 2 (up to 11)', () => {
    expect(parseOnboardingCheckInPayload({ ...base, checkInIndex: 6 }).checkInIndex).toBe(6);
    expect(() => parseOnboardingCheckInPayload({ ...base, checkInIndex: 12 })).toThrow();
  });
  it('tolerates legacy aiSystemPrompt field (dropped)', () => {
    const p = parseOnboardingCheckInPayload({ ...base, checkInIndex: 0, aiSystemPrompt: 'x' });
    expect(p).not.toHaveProperty('aiSystemPrompt');
  });
});
