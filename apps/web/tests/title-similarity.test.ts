import { describe, expect, it } from 'vitest';
import { titlesAreSimilar } from '../lib/ai/almog-commitments/persist';

describe('titlesAreSimilar (M2)', () => {
  it('detects near-duplicate cup/plate variations', () => {
    expect(titlesAreSimilar('כוסות ליד הצלחת', 'כוס ליד הצלחת')).toBe(true);
    expect(titlesAreSimilar('חצי כוס מים ליד הצלחת', 'כוסות ליד הצלחת')).toBe(true);
  });

  it('does not flag unrelated titles', () => {
    expect(titlesAreSimilar('לשתות מים בבוקר', 'הליכה של עשר דקות')).toBe(false);
  });
});
