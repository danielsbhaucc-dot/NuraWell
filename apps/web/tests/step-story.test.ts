import { describe, expect, it } from 'vitest';
import { buildStepStory, storyFromAssignment } from '../lib/almog/step-story';

describe('step-story', () => {
  it('builds recovery story from eased assignment', () => {
    const story = storyFromAssignment(
      {
        title: 'חצי כוס מים על הצלחת',
        reason: 'גרסה מותאמת ל"לשתות כוס מים"',
        detail: null,
        source_excerpt: null,
        relation: 'eases',
        metadata: { source: 'journey_eased', signal_kind: 'partial_today', expected: 3, reported: 1 },
      },
      {
        blocker: { description: 'קשה לי עם "לשתות כוס מים"', metadata: { source: 'journey_too_hard' } },
        originalTitle: 'לשתות כוס מים',
      }
    );

    expect(story.tag).toBe('התאמה מהשיעור');
    expect(story.headline).toContain('לשתות כוס מים');
    expect(story.observed).toContain('ביצוע חלקי');
    expect(story.helps).toContain('בונים הצלחות');
  });

  it('uses chat excerpt when available', () => {
    const story = buildStepStory({
      title: 'ללכת 5 דקות אחרי ארוחת ערב',
      reason: 'סיכמנו ביחד',
      sourceExcerpt: 'אני רוצה להתחיל קטן בערב',
    });
    expect(story.observed).toContain('בשיחה אמרת');
  });
});
