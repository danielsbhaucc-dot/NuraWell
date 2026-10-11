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

  it('weight reminders are opt-in: check_in only when the user enabled them', () => {
    const base = { daysSinceActive: 5, daysSinceLastWeight: 7, nudgeAfterDays: 2 };
    expect(decideStaleProfileAction({ ...base, aiContext: {} }).reason).not.toBe('weight_stale');
    const on = decideStaleProfileAction({ ...base, aiContext: { skip_weight_check_ins: false } });
    expect(on.action).toBe('check_in');
    expect(on.reason).toBe('weight_stale');
    // safety screening overrides the opt-in
    expect(
      decideStaleProfileAction({ ...base, aiContext: { skip_weight_check_ins: false, safety_no_weight: true } }).reason
    ).not.toBe('weight_stale');
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

  it('ghosting_unanswered micro_win before generic re_engage', () => {
    const d = decideStaleProfileAction({
      daysSinceActive: 5,
      aiContext: { dropout_risk: 'low', current_mood_signal: 'neutral' },
      daysSinceLastWeight: 1,
      nudgeAfterDays: 2,
      ghosting: { unansweredTouchCount: 2, habitGap: null },
    });
    expect(d.action).toBe('micro_win');
    expect(d.reason).toBe('ghosting_unanswered');
  });
});
