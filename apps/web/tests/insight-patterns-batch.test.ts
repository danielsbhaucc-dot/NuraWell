import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('../lib/ai/chat-ui/task-proposals', () => ({ queueTaskProposals: vi.fn() }));
import { proposalTargetFor, type PatternMeta } from '../lib/ai/insights/patterns/run-pattern-batch';
import { acceptPattern, type PatternInsight } from '../lib/ai/insights/patterns/llm';

const meta = (p: Partial<PatternMeta>): PatternMeta => ({
  kind: 'pattern', key: 'hard_weekday_6', theme: 'hard_weekday', user_line: 'x', tip: 'y', plan_title: 'הכנה קטנה לשבת',
  evidence_dates: [], weekday: 6, daypart: null, first_seen: '', last_confirmed: '', expires_at: '', ...p,
});

describe('proactive plan timing', () => {
  it('offers the Saturday plan on Friday, once', () => {
    const fri = new Date('2026-10-16T01:00:00Z'); // Fri 04:00 IL
    expect(proposalTargetFor(meta({}), fri)).toBe('2026-10-17');
    expect(proposalTargetFor(meta({ proposal_queued_for: '2026-10-17' }), fri)).toBeNull();
  });
  it('not on Tuesday', () => {
    expect(proposalTargetFor(meta({}), new Date('2026-10-13T01:00:00Z'))).toBeNull();
  });
  it('no plan title → no card', () => {
    expect(proposalTargetFor(meta({ plan_title: '' }), new Date('2026-10-16T01:00:00Z'))).toBeNull();
  });
});

const base: PatternInsight = {
  key: 'evening_sweets', theme: 'evening_sweets', category: 'nutrition',
  insight_he: 'ב-1.10, 5.10 ו-9.10 דניאל סיפר על מתוקים בערב', user_line_he: 'שמתי לב שהערבים מושכים אותך למתוק',
  tip_he: 'להכין מראש נשנוש ערב שאתה אוהב', plan_title_he: 'נשנוש ערב מוכן מראש',
  evidence_dates: ['2026-10-01', '2026-10-05', '2026-10-09'], confidence: 0.8, weekday: null, daypart: 'evening',
};
const dates = new Set(['2026-10-01', '2026-10-05', '2026-10-09']);

describe('acceptPattern (deterministic guard on LLM output)', () => {
  it('accepts grounded, safe pattern', () => expect(acceptPattern(base, dates)).toBe(true));
  it('rejects invented dates', () => expect(acceptPattern({ ...base, evidence_dates: ['2026-01-01', '2026-01-02'] }, dates)).toBe(false));
  it('rejects diet prescriptions', () => expect(acceptPattern({ ...base, tip_he: 'לאכול 1400 קלוריות ביום' }, dates)).toBe(false));
  it('rejects placeholders', () => expect(acceptPattern({ ...base, user_line_he: 'שמתי לב ש[PERSON_NAME] אוכל בערב' }, dates)).toBe(false));
  it('rejects low confidence', () => expect(acceptPattern({ ...base, confidence: 0.4 }, dates)).toBe(false));
});
