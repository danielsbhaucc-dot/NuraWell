import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/ai/groq-compat', () => ({ isGroqLaneAvailable: () => false }));
vi.mock('../lib/ai/client', () => ({ groq: {}, AI_MODELS: {} }));

import { buildProgramProposal, isGoodTinyTitle } from '../lib/ai/orchestrator/build-program-proposal';

describe('pivot proposal fallback ("בוא ניקח את זה קטן יותר")', () => {
  it('uses correct Hebrew and a number-neutral body for plural task titles', async () => {
    const p = await buildProgramProposal({
      decision: { state: 'struggling', reason: 'x', proposalKind: 'pivot', requiresBuyin: false },
      firstName: 'דניאל',
      aiCtx: { current_focus: 'שתיה של 2 כוסות מים לפני צהריים' } as never,
      companion: null,
      consecutiveCompletedDays: 0,
    });
    expect(p.headline).toBe('בוא ניקח את זה קטן יותר 💙');
    expect(p.body).not.toMatch(/מרגיש כבד/);
    expect(p.body).toContain('„שתיה של 2 כוסות מים לפני צהריים”');
    expect(p.requires_buyin).toBe(false);
    expect(p.next_step?.restore_to).toBe('שתיה של 2 כוסות מים לפני צהריים');
    expect(p.cta_accept_label).toBe('בוא ננסה ככה');
    expect(p.next_step?.title).toBe('שתיה של כוס מים אחת לפני צהריים');
  });
  it('prefers the real open task over a vague focus', async () => {
    const p = await buildProgramProposal({
      decision: { state: 'struggling', reason: 'x', proposalKind: 'pivot', requiresBuyin: false },
      firstName: 'דניאל',
      aiCtx: { current_focus: 'שבוע מים' } as never,
      companion: null,
      consecutiveCompletedDays: 0,
      targetTaskTitle: 'הליכה של 20 דקות אחרי ארוחת ערב',
    });
    expect(p.next_step?.title).toBe('הליכה של 10 דקות אחרי ארוחת ערב');
    expect(p.next_step?.restore_to).toBe('הליכה של 20 דקות אחרי ארוחת ערב');
  });
  it('rejects generic or unchanged AI tiny titles', () => {
    expect(isGoodTinyTitle('גרסה זעירה של מים', 'מים')).toBe(false);
    expect(isGoodTinyTitle('שתיה של 2 כוסות מים', 'שתיה של 2 כוסות מים')).toBe(false);
    expect(isGoodTinyTitle('כוס מים אחת לפני צהריים', 'שתיה של 2 כוסות מים לפני צהריים')).toBe(true);
  });
});
