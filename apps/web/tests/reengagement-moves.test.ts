import { describe, expect, it } from 'vitest';

import {
  CHURN_REASONS,
  churnSurveyOptions,
  computeReengagementMove,
  isActiveReengagementMove,
  moveCarriesSurvey,
  reengagementSentAtKey,
  shouldSilenceForReengagement,
  type ReengagementMove,
} from '../lib/churn/reengagement-moves';

function move(
  days: number,
  slot: 'morning' | 'midday' | 'evening',
  sentMoves: ReengagementMove[] = [],
  breakupSentAt: string | null = null
) {
  return computeReengagementMove({
    daysSinceLastActive: days,
    slot,
    sentMoves,
    cadenceStage: 'active',
    breakupSentAt,
  });
}

describe('computeReengagementMove — day gating', () => {
  it('day 0-2 → none (no re-engagement yet)', () => {
    expect(move(0, 'morning')).toBe('none');
    expect(move(1, 'morning')).toBe('none');
    expect(move(2, 'morning')).toBe('none');
  });

  it('day 3 morning → open_door, other slots none', () => {
    expect(move(3, 'morning')).toBe('open_door');
    expect(move(3, 'midday')).toBe('none');
    expect(move(3, 'evening')).toBe('none');
  });

  it('day 4 → mini_task, day 5 → fresh_start (morning only)', () => {
    expect(move(4, 'morning')).toBe('mini_task');
    expect(move(5, 'morning')).toBe('fresh_start');
    expect(move(4, 'evening')).toBe('none');
  });

  it('day 6 → none (intentional pause, protects identity move)', () => {
    expect(move(6, 'morning')).toBe('none');
    expect(move(6, 'midday')).toBe('none');
  });

  it('day 7 morning → identity', () => {
    expect(move(7, 'morning')).toBe('identity');
  });

  it('day 8 morning → withdrawing', () => {
    expect(move(8, 'morning')).toBe('withdrawing');
  });

  it('days 9-13 midday → quiet_presence, morning → none', () => {
    expect(move(9, 'midday')).toBe('quiet_presence');
    expect(move(13, 'midday')).toBe('quiet_presence');
    expect(move(9, 'morning')).toBe('none');
  });

  it('day 10 morning → breakup (carries exit survey)', () => {
    expect(move(10, 'morning')).toBe('breakup');
  });

  it('day 14+ → none (handed off to passive presence cron)', () => {
    expect(move(14, 'morning')).toBe('none');
    expect(move(30, 'midday')).toBe('none');
  });
});

describe('computeReengagementMove — dedup via sentMoves', () => {
  it('does not resend open_door if already sent', () => {
    expect(move(3, 'morning', ['open_door'])).toBe('none');
  });

  it('does not resend breakup if already sent', () => {
    expect(move(10, 'morning', ['breakup'])).toBe('none');
  });

  it('does not resend identity if already sent', () => {
    expect(move(7, 'morning', ['identity'])).toBe('none');
  });
});

describe('isActiveReengagementMove', () => {
  it('active habit moves are flagged active', () => {
    expect(isActiveReengagementMove('open_door')).toBe(true);
    expect(isActiveReengagementMove('breakup')).toBe(true);
    expect(isActiveReengagementMove('quiet_presence')).toBe(true);
  });

  it('passive + none are not active habit moves', () => {
    expect(isActiveReengagementMove('none')).toBe(false);
    expect(isActiveReengagementMove('passive_soft')).toBe(false);
    expect(isActiveReengagementMove('passive_value')).toBe(false);
  });
});

describe('shouldSilenceForReengagement', () => {
  it('silences day 6 morning/midday', () => {
    expect(
      shouldSilenceForReengagement({ daysSinceLastActive: 6, slot: 'morning', breakupSentAt: null })
    ).toBe(true);
    expect(
      shouldSilenceForReengagement({ daysSinceLastActive: 6, slot: 'evening', breakupSentAt: null })
    ).toBe(false);
  });

  it('silences everything after breakup', () => {
    expect(
      shouldSilenceForReengagement({
        daysSinceLastActive: 12,
        slot: 'morning',
        breakupSentAt: '2026-01-01T00:00:00Z',
      })
    ).toBe(true);
  });
});

describe('survey helpers', () => {
  it('only breakup carries survey', () => {
    expect(moveCarriesSurvey('breakup')).toBe(true);
    expect(moveCarriesSurvey('identity')).toBe(false);
  });

  it('churnSurveyOptions returns all reasons as id/label pairs', () => {
    const opts = churnSurveyOptions();
    expect(opts).toHaveLength(CHURN_REASONS.length);
    for (const o of opts) {
      expect(typeof o.id).toBe('string');
      expect(typeof o.label).toBe('string');
      expect(CHURN_REASONS).toContain(o.id);
    }
  });

  it('reengagementSentAtKey maps moves to timestamp keys', () => {
    expect(reengagementSentAtKey('breakup')).toBe('breakup_sent_at');
    expect(reengagementSentAtKey('open_door')).toBe('open_door_sent_at');
    expect(reengagementSentAtKey('none')).toBeNull();
  });
});
