import { describe, expect, it } from 'vitest';
import { applyAdminInput, deterministicReview, type AgentSession } from '@/lib/admin/journey-agent/agent';
import { formatSessionForTelegram } from '@/lib/admin/journey-agent/telegram-bridge';
import type { AiFilledStep } from '@/lib/admin/journey-agent/fill-core';

const step = (over: Partial<AiFilledStep> = {}): AiFilledStep => ({
  title: 'שתייה לפני ארוחה', description: 'd', summary_text: 'כוס מים לפני ארוחה עוזרת להרבה אנשים', duration_minutes: 8,
  quiz_questions: [1, 2, 3].map((i) => ({ id: `q${i}`, question: 'q', options: ['a', 'b'], correct_index: 0, explanation: '' })),
  game_items: [1, 2, 3].map((i) => ({ id: `g${i}`, statement: 's', is_true: true, explanation: '' })),
  commitment: null, researches: [],
  tasks: [{ id: 't', title: 'כוס מים לפני ארוחת צהריים', description: null, emoji: '💧', schedule: 'daily', times_per_day: null, weekly_day: null, meal_timing: null, meal_target: null, leveling: null }],
  habits: [],
  attention_stops: [1, 2, 3, 4].map((i) => ({ id: `a${i}`, time_seconds: i * 60, question: 'q', feedback: 'f', auto_resume_seconds: 5 })),
  ...over,
});

const session = (over: Partial<AgentSession> = {}): AgentSession => ({
  id: '11111111-2222-3333-4444-555555555555', status: 'waiting', source_text: 'x'.repeat(50), answers: {},
  analysis: { summary: 's', opinion: 'החומר טוב אבל חסר תמלול', concerns: ['אין תמלול'], key_ideas: [], target_behavior: 'מים', has_lesson_transcript: false, questions: [], rounds: 1 },
  pending_questions: [{ id: 'q1', label: 'יש תמלול?', why: '' }], draft: null, review: null, events: [], ...over,
});

describe('journey agent — deterministic review', () => {
  it('clean step passes', () => expect(deterministicReview(step(), null)).toEqual([]));
  it('flags missing minimums, no task, missing transcript', () => {
    const issues = deterministicReview(step({ quiz_questions: [], tasks: [], attention_stops: [] }), session().analysis);
    expect(issues.join('|')).toMatch(/שאלות הבנה/);
    expect(issues.join('|')).toMatch(/נקודות קשב/);
    expect(issues.join('|')).toMatch(/משימה/);
    expect(issues.join('|')).toMatch(/תמלול/);
  });
  it('flags personal nutrition prescription in tasks', () => {
    const issues = deterministicReview(step({ tasks: [{ ...step().tasks[0], title: 'לאכול 1500 קלוריות ביום' }] }), null);
    expect(issues.some((i) => i.includes('ייעוץ תזונתי'))).toBe(true);
  });
});

describe('journey agent — admin input', () => {
  it('answers clear pending questions and keep working', () => {
    const n = applyAdminInput(session(), { answers: { q1: 'כן, מצורף' } });
    expect(n.pending_questions).toEqual([]);
    expect(n.answers.q1).toBe('כן, מצורף');
    expect(n.status).toBe('working');
  });
  it('a comment on a finished draft starts a revision (draft cleared)', () => {
    const n = applyAdminInput(session({ status: 'done', draft: step(), pending_questions: [] }), { comment: 'השאלות קלות מדי' });
    expect(n.draft).toBeNull();
    expect(Object.values(n.answers)).toContain('השאלות קלות מדי');
  });
});

describe('journey agent — telegram report', () => {
  it('waiting: opinion + numbered questions', () => {
    const t = formatSessionForTelegram(session());
    expect(t).toContain('החומר טוב');
    expect(t).toContain('1. יש תמלול?');
  });
  it('done: counts + editor link with session id', () => {
    const t = formatSessionForTelegram(session({ status: 'done', draft: step(), pending_questions: [], review: { score: 8, verdict: 'טוב', strengths: [], issues: [], suggestions: [] } }));
    expect(t).toContain('3 שאלות');
    expect(t).toContain('agentSession=11111111-2222-3333-4444-555555555555');
  });
});
