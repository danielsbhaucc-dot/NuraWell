import { describe, expect, it } from 'vitest';
import { parseJourneyFollowUpFromMessage } from '../lib/ai/journey-follow-up-promise';
import {
  formatJourneyCompanionPromptBlock,
  JOURNEY_COMPANION_INTERVAL_DAYS,
  shouldNudgeJourneyCompanion,
  type JourneyCompanionContext,
} from '../lib/workflows/journey-companion';

const base: JourneyCompanionContext = {
  phase: 'not_started',
  stepId: 's1',
  stepTitle: 'היכרות',
  stationTitle: 'התחלה',
  stepNumber: 1,
  daysSinceOnboarding: 2,
  daysSinceStepTouch: null,
  lastSection: null,
  snapshot: { pendingTaskTitles: [], openAcceptedCount: 0 },
  followUp: null,
  followUpDue: false,
  daysSinceLastCompanionNudge: 2,
  unansweredAlmogTouches: 0,
  nudgeIntervalDays: JOURNEY_COMPANION_INTERVAL_DAYS,
  lifeContext: null,
  lifeContextualDue: false,
};

describe('shouldNudgeJourneyCompanion', () => {
  it('ממתין יום אחרי אונבורדינג', () => {
    expect(shouldNudgeJourneyCompanion({ ...base, daysSinceOnboarding: 0 })).toBe(false);
    expect(shouldNudgeJourneyCompanion({ ...base, daysSinceOnboarding: 1 })).toBe(true);
  });

  it('מגע יומי גם באמצע צעד', () => {
    expect(
      shouldNudgeJourneyCompanion({
        ...base,
        phase: 'step_in_progress',
        daysSinceLastCompanionNudge: 0,
      })
    ).toBe(false);
    expect(
      shouldNudgeJourneyCompanion({
        ...base,
        phase: 'step_in_progress',
        daysSinceLastCompanionNudge: 1,
      })
    ).toBe(true);
  });

  it('דוחף כשהבטחה מהצ׳אט הגיעה', () => {
    expect(
      shouldNudgeJourneyCompanion({
        ...base,
        followUpDue: true,
        daysSinceLastCompanionNudge: 0,
      })
    ).toBe(true);
  });

  it('מגע ראשון למסע', () => {
    expect(
      shouldNudgeJourneyCompanion({
        ...base,
        daysSinceLastCompanionNudge: null,
      })
    ).toBe(true);
  });
});

describe('parseJourneyFollowUpFromMessage', () => {
  const now = new Date('2026-05-19T08:00:00+03:00');

  it('מזהה מחר', () => {
    const f = parseJourneyFollowUpFromMessage('אמשיך את הצעד מחר בבוקר', 'step-1', now);
    expect(f?.label).toContain('מחר');
    expect(f?.step_id).toBe('step-1');
  });

  it('מזהה מחר בבוקר אעשה X', () => {
    const f = parseJourneyFollowUpFromMessage('מחר בבוקר אעשה את האימון', null, now);
    expect(f?.label).toContain('אימון');
  });

  it('מזהה עוד שעה', () => {
    const f = parseJourneyFollowUpFromMessage('אעשה את זה עוד שעה', null, now);
    expect(f?.label).toContain('שעה');
    const diff = new Date(f!.check_at).getTime() - now.getTime();
    expect(diff).toBeGreaterThan(50 * 60 * 1000);
    expect(diff).toBeLessThan(70 * 60 * 1000);
  });
});

describe('formatJourneyCompanionPromptBlock', () => {
  it('מזכיר צעד', () => {
    const block = formatJourneyCompanionPromptBlock(base);
    expect(block).toContain('היכרות');
    expect(block).toContain('מסע');
  });

  it('טון חברי כשלא ענו', () => {
    const block = formatJourneyCompanionPromptBlock({
      ...base,
      unansweredAlmogTouches: 4,
    });
    expect(block).toContain('לא ענו');
    expect(block).toContain('הישאר בקו');
  });

  it('כולל נושאים פתוחים ברקע', () => {
    const block = formatJourneyCompanionPromptBlock({
      ...base,
      phase: 'step_in_progress',
      snapshot: { pendingTaskTitles: ['מים בבוקר'], openAcceptedCount: 1 },
    });
    expect(block).toContain('מים בבוקר');
    expect(block).not.toContain('עדיין לא סימנת');
  });
});
