import { describe, expect, it } from 'vitest';

import { decideStaleProfileAction } from '../lib/ai/cron-ops-action';
import {
  buildRollerCoasterChatPromptBlock,
  cronOpsShouldUseLlm,
  daysSinceLastHabitDone,
  detectPrimaryHabitGap,
  detectRelapseInMessage,
  resolveReturnVisitContext,
} from '../lib/ai/roller-coaster';

describe('roller-coaster', () => {
  it('detectRelapseInMessage', () => {
    expect(detectRelapseInMessage('אכלתי פיצה ויש לי בושה')).toBe(true);
    expect(detectRelapseInMessage('היי מה נשמע')).toBe(false);
  });

  it('daysSinceLastHabitDone when never marked', () => {
    const days = daysSinceLastHabitDone(
      [{ updated_at: new Date(Date.now() - 4 * 86400000).toISOString(), habits_progress: { h1: [] } }],
      'h1'
    );
    expect(days).toBeGreaterThanOrEqual(3);
  });

  it('detectPrimaryHabitGap for water habit', () => {
    const gap = detectPrimaryHabitGap([
      {
        updated_at: new Date(Date.now() - 5 * 86400000).toISOString(),
        habits_progress: { w1: [] },
        journey_steps: {
          habits: [{ id: 'w1', title: 'שתיית מים', frequency: 'daily' }],
        },
      },
    ]);
    expect(gap?.kind).toBe('water');
    expect(gap?.daysMissed).toBeGreaterThanOrEqual(3);
  });

  it('resolveReturnVisitContext crisis after long gap', () => {
    const ctx = resolveReturnVisitContext({
      daysSincePriorChat: 8,
      daysSinceProfileActive: 8,
      aiContext: { dropout_risk: 'high' },
      unansweredTouchCount: 0,
    });
    expect(ctx.mode).toBe('crisis_reconnect');
  });

  it('decideStaleProfileAction crisis_reconnect', () => {
    const d = decideStaleProfileAction({
      daysSinceActive: 10,
      aiContext: { dropout_risk: 'high' },
      daysSinceLastWeight: 1,
      nudgeAfterDays: 2,
      ghosting: { unansweredTouchCount: 3, habitGap: null },
    });
    expect(d.action).toBe('crisis_reconnect');
  });

  it('decideStaleProfileAction habit_gap_water', () => {
    const d = decideStaleProfileAction({
      daysSinceActive: 3,
      aiContext: {},
      daysSinceLastWeight: 1,
      nudgeAfterDays: 2,
      ghosting: {
        unansweredTouchCount: 0,
        habitGap: {
          habitId: 'w1',
          habitTitle: 'מים',
          kind: 'water',
          daysMissed: 4,
        },
      },
    });
    expect(d.action).toBe('micro_win');
    expect(d.reason).toBe('habit_gap_water');
  });

  it('cronOps uses template for crisis without notes', () => {
    expect(cronOpsShouldUseLlm('crisis_reconnect', 'high', {}, 'crisis_long_absence')).toBe(false);
  });

  it('cronOps uses LLM for micro_win when analysis notes exist', () => {
    expect(
      cronOpsShouldUseLlm('micro_win', 'medium', { notes: 'עומס בעבודה' }, 'needs_small_win')
    ).toBe(true);
  });

  it('buildRollerCoasterChatPromptBlock null when active', () => {
    expect(
      buildRollerCoasterChatPromptBlock({
        returnVisitCtx: { mode: 'none', daysAway: 0, reason: 'active_recently' },
        firstName: 'דן',
        relapseDetected: false,
      })
    ).toBeNull();
  });
});
