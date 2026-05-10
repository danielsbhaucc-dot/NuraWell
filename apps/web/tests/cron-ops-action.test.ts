import { describe, expect, it } from 'vitest';
import { decideStaleProfileAction } from '../lib/ai/cron-ops-action';

describe('decideStaleProfileAction', () => {
  it('silent when avoid_push', () => {
    const d = decideStaleProfileAction({
      daysSinceActive: 10,
      aiContext: { avoid_push: true },
      daysSinceLastWeight: 10,
      nudgeAfterDays: 2,
    });
    expect(d.action).toBe('silent');
  });

  it('check_in when weight stale and skip not set', () => {
    const d = decideStaleProfileAction({
      daysSinceActive: 5,
      aiContext: {},
      daysSinceLastWeight: 7,
      nudgeAfterDays: 2,
    });
    expect(d.action).toBe('check_in');
  });

  it('skips check_in when skip_weight_check_ins', () => {
    const d = decideStaleProfileAction({
      daysSinceActive: 5,
      aiContext: { skip_weight_check_ins: true },
      daysSinceLastWeight: 7,
      nudgeAfterDays: 2,
    });
    expect(d.action).not.toBe('check_in');
  });

  it('re_engage when inactive past threshold', () => {
    const d = decideStaleProfileAction({
      daysSinceActive: 9,
      aiContext: { dropout_risk: 'low', current_mood_signal: 'neutral' },
      daysSinceLastWeight: 1,
      nudgeAfterDays: 4,
    });
    expect(d.action).toBe('re_engage');
  });
});
