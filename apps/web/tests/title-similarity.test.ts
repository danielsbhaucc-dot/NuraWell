import { describe, expect, it } from 'vitest';
import {
  groupSimilarByTitle,
  titlesAreSimilar,
} from '../lib/ai/almog-commitments/title-similarity';
import { titlesAreSimilar as titlesAreSimilarFromPersist } from '../lib/ai/almog-commitments/persist';

describe('titlesAreSimilar (M2)', () => {
  it('detects near-duplicate cup/plate variations', () => {
    expect(titlesAreSimilar('כוסות ליד הצלחת', 'כוס ליד הצלחת')).toBe(true);
    expect(titlesAreSimilar('חצי כוס מים ליד הצלחת', 'כוסות ליד הצלחת')).toBe(true);
    expect(titlesAreSimilarFromPersist('כוסות ליד הצלחת', 'כוס ליד הצלחת')).toBe(true);
  });

  it('does not flag unrelated titles', () => {
    expect(titlesAreSimilar('לשתות מים בבוקר', 'הליכה של עשר דקות')).toBe(false);
  });

  it('groups near-duplicate tasks into one representative', () => {
    const grouped = groupSimilarByTitle(
      [
        { id: '1', title: 'כוסות ליד הצלחת' },
        { id: '2', title: 'כוס ליד הצלחת' },
        { id: '3', title: 'חצי כוס מים ליד הצלחת' },
        { id: '4', title: 'הליכה קצרה' },
      ],
      0.55
    );
    expect(grouped).toHaveLength(2);
    const cups = grouped.find((g) => g.similarCount > 1);
    expect(cups?.similarCount).toBe(3);
    expect(cups?.groupedIds).toHaveLength(3);
  });
});
