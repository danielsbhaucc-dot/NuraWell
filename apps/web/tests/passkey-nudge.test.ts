import { describe, expect, it } from 'vitest';
import { NUDGE_COOLDOWN_DAYS, NUDGE_MAX_SHOWS, nudgeEligible } from '@/lib/auth/passkey-nudge';

const NOW = Date.parse('2026-10-20T12:00:00Z');
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();
const base = { isAdmin: false, isDemo: false, passkeyCount: 0, state: null };

describe('passkey nudge frequency', () => {
  it('first time: eligible', () => expect(nudgeEligible(base, NOW)).toBe(true));
  it('never for admins, demo sessions or users who already have a passkey', () => {
    expect(nudgeEligible({ ...base, isAdmin: true }, NOW)).toBe(false);
    expect(nudgeEligible({ ...base, isDemo: true }, NOW)).toBe(false);
    expect(nudgeEligible({ ...base, passkeyCount: 1 }, NOW)).toBe(false);
  });
  it(`not again within ${NUDGE_COOLDOWN_DAYS} days`, () => {
    const st = (d: number) => ({ shown_count: 1, last_shown_at: daysAgo(d), last_outcome: 'dismissed' });
    expect(nudgeEligible({ ...base, state: st(1) }, NOW)).toBe(false);
    expect(nudgeEligible({ ...base, state: st(29.9) }, NOW)).toBe(false);
    expect(nudgeEligible({ ...base, state: st(30.1) }, NOW)).toBe(true);
  });
  it(`stops after ${NUDGE_MAX_SHOWS} offers`, () => {
    expect(nudgeEligible({ ...base, state: { shown_count: NUDGE_MAX_SHOWS - 1, last_shown_at: daysAgo(90), last_outcome: 'dismissed' } }, NOW)).toBe(true);
    expect(nudgeEligible({ ...base, state: { shown_count: NUDGE_MAX_SHOWS, last_shown_at: daysAgo(400), last_outcome: 'dismissed' } }, NOW)).toBe(false);
  });
  it('never again after enrolling', () => {
    expect(nudgeEligible({ ...base, state: { shown_count: 1, last_shown_at: daysAgo(400), last_outcome: 'enrolled' } }, NOW)).toBe(false);
  });
});
