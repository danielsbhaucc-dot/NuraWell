import { describe, expect, it } from 'vitest';

import { extractSurvey } from '../lib/notifications/replyable';
import { CHURN_REASONS, churnSurveyOptions } from '../lib/churn/reengagement-moves';

/**
 * חוזה ה-Exit Survey שעובר בין ה-send (metadata.survey) → ה-UI (extractSurvey)
 * → ה-API (/api/v1/churn-feedback). הבדיקה מאמתת את הסריאליזציה/דה-סריאליזציה
 * ואת רשימת הסיבות המותרות (חייבת להתאים ל-CHECK ב-migration 000044).
 */
describe('exit survey metadata contract', () => {
  it('extractSurvey parses a valid churn_exit survey', () => {
    const meta = {
      survey: { type: 'churn_exit', options: churnSurveyOptions(), responded: false },
    };
    const survey = extractSurvey(meta);
    expect(survey).not.toBeNull();
    expect(survey?.type).toBe('churn_exit');
    expect(survey?.responded).toBe(false);
    expect(survey?.options.length).toBe(CHURN_REASONS.length);
  });

  it('extractSurvey ignores non-survey metadata', () => {
    expect(extractSurvey({ source: 'almog_habit_checkpoint' })).toBeNull();
    expect(extractSurvey({ survey: { type: 'other' } })).toBeNull();
    expect(extractSurvey(null)).toBeNull();
    expect(extractSurvey(undefined)).toBeNull();
  });

  it('extractSurvey reflects responded + reason after submit', () => {
    const meta = {
      survey: {
        type: 'churn_exit',
        options: churnSurveyOptions(),
        responded: true,
        reason: 'too_busy',
      },
    };
    const survey = extractSurvey(meta);
    expect(survey?.responded).toBe(true);
    expect(survey?.reason).toBe('too_busy');
  });

  it('survey option ids are all valid churn reasons (matches DB CHECK)', () => {
    for (const opt of churnSurveyOptions()) {
      expect(CHURN_REASONS).toContain(opt.id);
    }
  });

  it('extractSurvey drops malformed options', () => {
    const meta = {
      survey: {
        type: 'churn_exit',
        options: [{ id: 'too_busy', label: 'עמוס' }, { id: 123 }, { label: 'no id' }],
        responded: false,
      },
    };
    const survey = extractSurvey(meta);
    expect(survey?.options).toHaveLength(1);
    expect(survey?.options[0]?.id).toBe('too_busy');
  });
});
