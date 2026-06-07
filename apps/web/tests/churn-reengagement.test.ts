import { describe, it, expect } from 'vitest';
import {
  computeEngagementStatus,
  computeReengagementMove,
  isActiveReengagementMove,
  shouldSilenceForReengagement,
  churnSurveyOptions,
  CHURN_REASONS,
  REENGAGEMENT_MOVES,
  type ReengagementMove,
} from '../lib/churn/reengagement-moves';
import {
  mainGoalLabelHe,
  mainObstacleLabelHe,
  identityContextBlock,
  reengagementMoveBlock,
} from '../lib/churn/reengagement-prompt-blocks';
import {
  decidePassiveKind,
  buildPassiveBody,
  pickPassiveValueTemplate,
} from '../lib/churn/passive-presence-batch';
import { detectPassiveTrigger } from '../lib/churn/israeli-holidays';
import { reengagementMoveSchema } from '../lib/workflows/almog-habit-checkpoint-payload';

const NO_MOVES: ReengagementMove[] = [];

function move(day: number, slot: 'morning' | 'midday' | 'evening', sent: ReengagementMove[] = NO_MOVES) {
  return computeReengagementMove({
    daysSinceLastActive: day,
    slot,
    sentMoves: sent,
    cadenceStage: 'dormant_early',
    breakupSentAt: null,
  });
}

describe('computeReengagementMove — day-by-day protocol', () => {
  it('day 3 morning → open_door', () => {
    expect(move(3, 'morning')).toBe('open_door');
  });

  it('day 4 morning → mini_task', () => {
    expect(move(4, 'morning')).toBe('mini_task');
  });

  it('day 5 morning → fresh_start', () => {
    expect(move(5, 'morning')).toBe('fresh_start');
  });

  it('day 6 morning → none (deliberate pause, no exit survey before identity)', () => {
    expect(move(6, 'morning')).toBe('none');
    expect(move(6, 'midday')).toBe('none');
    expect(move(6, 'evening')).toBe('none');
  });

  it('day 7 morning → identity', () => {
    expect(move(7, 'morning')).toBe('identity');
  });

  it('day 8 morning → withdrawing', () => {
    expect(move(8, 'morning')).toBe('withdrawing');
  });

  it('days 9–13 midday → quiet_presence, other slots none', () => {
    expect(move(9, 'midday')).toBe('quiet_presence');
    expect(move(11, 'midday')).toBe('quiet_presence');
    expect(move(13, 'midday')).toBe('quiet_presence');
    expect(move(9, 'morning')).toBe('none');
  });

  it('day 10 morning → breakup (carries exit survey)', () => {
    expect(move(10, 'morning')).toBe('breakup');
  });

  it('day 10 non-morning → not breakup (quiet_presence in midday)', () => {
    expect(move(10, 'midday')).toBe('quiet_presence');
    expect(move(10, 'evening')).toBe('none');
  });

  it('14+ → none (passive presence cron takes over)', () => {
    expect(move(14, 'morning')).toBe('none');
    expect(move(30, 'midday')).toBe('none');
  });

  it('dedup — already-sent moves are not repeated', () => {
    expect(move(3, 'morning', ['open_door'])).toBe('none');
    expect(move(7, 'morning', ['identity'])).toBe('none');
    expect(move(10, 'morning', ['breakup'])).toBe('none');
  });
});

describe('computeEngagementStatus', () => {
  it('maps days to status correctly', () => {
    expect(computeEngagementStatus(0)).toBe('active');
    expect(computeEngagementStatus(1)).toBe('active');
    expect(computeEngagementStatus(2)).toBe('slipping');
    expect(computeEngagementStatus(3)).toBe('at_risk');
    expect(computeEngagementStatus(6)).toBe('at_risk');
    expect(computeEngagementStatus(7)).toBe('dormant');
    expect(computeEngagementStatus(13)).toBe('dormant');
    expect(computeEngagementStatus(14)).toBe('churned');
    expect(computeEngagementStatus(100)).toBe('churned');
  });
});

describe('isActiveReengagementMove', () => {
  it('true for content-override moves, false for none/passive', () => {
    expect(isActiveReengagementMove('open_door')).toBe(true);
    expect(isActiveReengagementMove('breakup')).toBe(true);
    expect(isActiveReengagementMove('quiet_presence')).toBe(true);
    expect(isActiveReengagementMove('none')).toBe(false);
    expect(isActiveReengagementMove('passive_soft')).toBe(false);
    expect(isActiveReengagementMove('passive_value')).toBe(false);
  });
});

describe('shouldSilenceForReengagement', () => {
  it('silences day 6 morning/midday but not evening', () => {
    expect(
      shouldSilenceForReengagement({ daysSinceLastActive: 6, slot: 'morning', breakupSentAt: null })
    ).toBe(true);
    expect(
      shouldSilenceForReengagement({ daysSinceLastActive: 6, slot: 'midday', breakupSentAt: null })
    ).toBe(true);
    expect(
      shouldSilenceForReengagement({ daysSinceLastActive: 6, slot: 'evening', breakupSentAt: null })
    ).toBe(false);
  });

  it('silences everything after breakup', () => {
    expect(
      shouldSilenceForReengagement({
        daysSinceLastActive: 11,
        slot: 'morning',
        breakupSentAt: '2026-01-01T00:00:00Z',
      })
    ).toBe(true);
  });

  it('does not silence active protocol days', () => {
    expect(
      shouldSilenceForReengagement({ daysSinceLastActive: 3, slot: 'morning', breakupSentAt: null })
    ).toBe(false);
  });
});

describe('survey options + reasons', () => {
  it('churnSurveyOptions returns mutable copies with all reasons', () => {
    const opts = churnSurveyOptions();
    expect(opts.map((o) => o.id).sort()).toEqual([...CHURN_REASONS].sort());
    expect(opts.every((o) => typeof o.label === 'string' && o.label.length > 0)).toBe(true);
  });
});

describe('type sync — REENGAGEMENT_MOVES === zod schema options', () => {
  it('the move list matches the payload zod enum', () => {
    expect([...REENGAGEMENT_MOVES].sort()).toEqual([...reengagementMoveSchema.options].sort());
  });
});

describe('prompt blocks', () => {
  it('mainGoalLabelHe / mainObstacleLabelHe translate known codes', () => {
    expect(mainGoalLabelHe('weight_loss')).toContain('משקל');
    expect(mainGoalLabelHe(null)).toBeNull();
    expect(mainObstacleLabelHe('no_time', null)).toContain('זמן');
    expect(mainObstacleLabelHe('other', 'הילדים')).toBe('הילדים');
  });

  it('identityContextBlock uses provided labels as-is', () => {
    const block = identityContextBlock({
      mainGoal: 'ירידה במשקל',
      mainObstacle: 'אין זמן',
      mainObstacleDetail: null,
      streakDays: 5,
    });
    expect(block).toContain('ירידה במשקל');
    expect(block).toContain('אין זמן');
    expect(block).toContain('5');
  });

  it('reengagementMoveBlock returns null for none, text for breakup', () => {
    expect(reengagementMoveBlock('none', { firstName: 'דני' })).toBeNull();
    const breakup = reengagementMoveBlock('breakup', { firstName: 'דני' });
    expect(breakup).toContain('BREAKUP');
  });
});

describe('passive presence decision', () => {
  const now = new Date('2026-03-15T08:00:00Z');

  it('returns trigger when a trigger is present and none sent recently', () => {
    expect(
      decidePassiveKind({ now, trigger: 'month_start', lastPassiveValueAt: null, lastPassiveTriggerAt: null })
    ).toBe('trigger');
  });

  it('returns value when 30+ days since last value and no trigger', () => {
    const old = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000).toISOString();
    expect(
      decidePassiveKind({ now, trigger: null, lastPassiveValueAt: old, lastPassiveTriggerAt: null })
    ).toBe('value');
  });

  it('returns soft when value was recent and no trigger', () => {
    const recent = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString();
    expect(
      decidePassiveKind({ now, trigger: null, lastPassiveValueAt: recent, lastPassiveTriggerAt: null })
    ).toBe('soft');
  });

  it('buildPassiveBody returns non-empty text for each kind', () => {
    expect(buildPassiveBody({ kind: 'value', trigger: null, now }).length).toBeGreaterThan(0);
    expect(buildPassiveBody({ kind: 'soft', trigger: null, now }).length).toBeGreaterThan(0);
    expect(buildPassiveBody({ kind: 'trigger', trigger: 'month_start', now }).length).toBeGreaterThan(0);
  });

  it('pickPassiveValueTemplate is deterministic per month', () => {
    expect(pickPassiveValueTemplate(now)).toBe(pickPassiveValueTemplate(new Date('2026-03-28T20:00:00Z')));
  });
});

describe('detectPassiveTrigger', () => {
  it('detects month start', () => {
    expect(detectPassiveTrigger(new Date('2026-04-01T09:00:00Z'), 'UTC')).toBe('month_start');
  });
});
