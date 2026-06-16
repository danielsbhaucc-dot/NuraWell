import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

import { groupInsightsForPrompt } from '../lib/ai/mentorship/fetch-insights-for-synthesis';
import { formatCurrentUserStrategy } from '../lib/ai/mentorship/get-active-context';
import { isSensitiveMentalState } from '../lib/ai/mentorship/is-sensitive-state';
import {
  DEFAULT_MENTORSHIP_STRATEGY,
  MentorshipStrategySchema,
  type MentorshipStrategy,
} from '../lib/ai/mentorship/schema';
import { synthesizeUserStrategy } from '../lib/ai/mentorship/synthesize-user-strategy';

vi.mock('../lib/ai/mentorship/fetch-insights-for-synthesis', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('../lib/ai/mentorship/fetch-insights-for-synthesis')
  >();
  return {
    ...actual,
    fetchInsightsForSynthesis: vi.fn(),
  };
});

vi.mock('../lib/ai/mentorship/persist-strategy', () => ({
  upsertUserMentorshipStrategy: vi.fn(),
}));

vi.mock('../lib/ai/mentorship/synthesize-profile', () => ({
  synthesizeStrategyWithLlm: vi.fn(),
  MentorshipSynthesisError: class MentorshipSynthesisError extends Error {
    constructor(
      message: string,
      readonly code: string
    ) {
      super(message);
      this.name = 'MentorshipSynthesisError';
    }
  },
}));

import { fetchInsightsForSynthesis } from '../lib/ai/mentorship/fetch-insights-for-synthesis';
import { upsertUserMentorshipStrategy } from '../lib/ai/mentorship/persist-strategy';
import { synthesizeStrategyWithLlm } from '../lib/ai/mentorship/synthesize-profile';

const strategy: MentorshipStrategy = {
  psychological_approach: 'אמפתיה עמוקה, בלי לחץ. המשתמש חושש מכישלון.',
  active_blockers: ['עומס בעבודה'],
  current_focus: ['כוס מים לפני ארוחה'],
  medical_red_flags: ['סוכר גבוה בבדיקות'],
  next_best_action: 'שתה כוס מים עכשיו וספר איך הרגשת.',
};

describe('formatCurrentUserStrategy', () => {
  it('wraps strategy in CURRENT_USER_STRATEGY with core fields', () => {
    const xml = formatCurrentUserStrategy(strategy);

    expect(xml).toContain('<CURRENT_USER_STRATEGY>');
    expect(xml).toContain('</CURRENT_USER_STRATEGY>');
    expect(xml).toContain('<PsychologicalApproach>');
    expect(xml).toContain(strategy.psychological_approach);
    expect(xml).toContain('<ActiveBlockers>');
    expect(xml).toContain('עומס בעבודה');
    expect(xml).toContain('<CurrentFocus>');
    expect(xml).toContain('כוס מים לפני ארוחה');
    expect(xml).toContain('<NextBestAction>');
    expect(xml).toContain(strategy.next_best_action);
  });

  it('adds SafetyInstruction only when medical_red_flags exist', () => {
    const withFlags = formatCurrentUserStrategy(strategy);
    expect(withFlags).toContain('<MedicalRedFlags>');
    expect(withFlags).toContain('<SafetyInstruction>');
    expect(withFlags).toContain('אסור לתת ייעוץ רפואי');

    const withoutFlags = formatCurrentUserStrategy({
      ...strategy,
      medical_red_flags: [],
    });
    expect(withoutFlags).not.toContain('<MedicalRedFlags>');
    expect(withoutFlags).not.toContain('<SafetyInstruction>');
  });

  it('omits empty blocker and focus sections', () => {
    const minimal = formatCurrentUserStrategy({
      psychological_approach: 'גישה חמה וסקרנית.',
      active_blockers: [],
      current_focus: [],
      medical_red_flags: [],
      next_best_action: 'קח נשימה אחת.',
    });

    expect(minimal).not.toContain('<ActiveBlockers>');
    expect(minimal).not.toContain('<CurrentFocus>');
    expect(minimal).toContain('<NextBestAction>קח נשימה אחת.</NextBestAction>');
  });
});

describe('MentorshipStrategySchema', () => {
  it('accepts a valid strategy and rejects overflow arrays', () => {
    expect(MentorshipStrategySchema.safeParse(strategy).success).toBe(true);

    const tooManyBlockers = MentorshipStrategySchema.safeParse({
      ...strategy,
      active_blockers: ['א', 'ב', 'ג', 'ד'],
    });
    expect(tooManyBlockers.success).toBe(false);
  });
});

describe('groupInsightsForPrompt', () => {
  it('groups insights by category without score noise', () => {
    const text = groupInsightsForPrompt([
      {
        category: 'blocker',
        insight_text: 'פחד מכישלון',
        actionability_score: 9,
        confidence: 0.9,
        mention_count: 2,
        last_seen_at: '2026-01-01T00:00:00Z',
      },
      {
        category: 'nutrition',
        insight_text: 'קושי עם ארוחת בוקר',
        actionability_score: 7,
        confidence: 0.8,
        mention_count: 1,
        last_seen_at: '2026-01-02T00:00:00Z',
      },
    ]);

    expect(text).toContain('[blocker]');
    expect(text).toContain('פחד מכישלון');
    expect(text).not.toContain('(a9)');
    expect(text).not.toContain('(2x)');
  });
});

describe('isSensitiveMentalState', () => {
  it('detects blockers and emotional keywords', () => {
    expect(isSensitiveMentalState({ ...strategy, active_blockers: ['לחץ'] })).toBe(true);
    expect(
      isSensitiveMentalState({
        ...DEFAULT_MENTORSHIP_STRATEGY,
        psychological_approach: 'המשתמש חווה חרדה גבוהה',
      })
    ).toBe(true);
    expect(
      isSensitiveMentalState({
        ...DEFAULT_MENTORSHIP_STRATEGY,
        psychological_approach: 'גישה חמה וסקרנית.',
      })
    ).toBe(false);
  });
});

describe('synthesizeUserStrategy', () => {
  const admin = {} as Parameters<typeof synthesizeUserStrategy>[0];
  const userId = 'user-123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('persists default strategy when there are no insights (no LLM)', async () => {
    vi.mocked(fetchInsightsForSynthesis).mockResolvedValue([]);

    const result = await synthesizeUserStrategy(admin, userId);

    expect(result.ok).toBe(true);
    expect(result.used_default).toBe(true);
    expect(result.source_insight_count).toBe(0);
    expect(result.strategy).toEqual(DEFAULT_MENTORSHIP_STRATEGY);
    expect(upsertUserMentorshipStrategy).toHaveBeenCalledWith(
      admin,
      userId,
      DEFAULT_MENTORSHIP_STRATEGY,
      undefined
    );
    expect(synthesizeStrategyWithLlm).not.toHaveBeenCalled();
  });

  it('calls LLM and upserts synthesized strategy when insights exist', async () => {
    const insights = [
      {
        category: 'mental' as const,
        insight_text: 'מתוסכל מהעבודה',
        actionability_score: 8,
        confidence: 0.85,
        mention_count: 1,
        last_seen_at: '2026-01-01T00:00:00Z',
      },
    ];
    const synthesized: MentorshipStrategy = {
      psychological_approach: 'אמפתיה, צעדים קטנים.',
      active_blockers: ['עומס'],
      current_focus: ['מים'],
      medical_red_flags: [],
      next_best_action: 'שתה מים.',
    };

    vi.mocked(fetchInsightsForSynthesis).mockResolvedValue(insights);
    vi.mocked(synthesizeStrategyWithLlm).mockResolvedValue(synthesized);

    const result = await synthesizeUserStrategy(admin, userId);

    expect(result.ok).toBe(true);
    expect(result.used_default).toBe(false);
    expect(result.source_insight_count).toBe(1);
    expect(result.strategy).toEqual(synthesized);
    expect(synthesizeStrategyWithLlm).toHaveBeenCalledOnce();
    expect(upsertUserMentorshipStrategy).toHaveBeenCalledWith(admin, userId, synthesized, undefined);
  });

  it('falls back to default strategy when LLM fails', async () => {
    vi.mocked(fetchInsightsForSynthesis).mockResolvedValue([
      {
        category: 'goal',
        insight_text: 'ירידה במשקל',
        actionability_score: 6,
        confidence: 0.7,
        mention_count: 1,
        last_seen_at: '2026-01-01T00:00:00Z',
      },
    ]);
    vi.mocked(synthesizeStrategyWithLlm).mockRejectedValue(new Error('LLM down'));

    const result = await synthesizeUserStrategy(admin, userId);

    expect(result.ok).toBe(false);
    expect(result.used_default).toBe(true);
    expect(result.strategy).toEqual(DEFAULT_MENTORSHIP_STRATEGY);
    expect(upsertUserMentorshipStrategy).toHaveBeenCalledWith(
      admin,
      userId,
      DEFAULT_MENTORSHIP_STRATEGY,
      undefined
    );
  });
});
