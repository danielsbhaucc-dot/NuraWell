import { describe, expect, it } from 'vitest';
import { isSensitiveForReaction } from '@/lib/ai/emoji-reaction/decide-emoji-reaction';
import { routeV3 } from '@/lib/ai/routing-v3';

describe('emoji never on sensitive topics', () => {
  it.each(['אחרי שאני אוכל הרבה אני מקיא', 'לפעמים אני חושב שעדיף שלא אהיה פה', 'אבא שלי נפטר בשבוע שעבר', 'ירדתי 2 קילו החודש', 'אני לא אוכל כבר יומיים'])('%s', (m) => {
    expect(isSensitiveForReaction(m)).toBe(true);
  });
  it.each(['עשיתי את ההליכה היום!', 'היה לי יום ממש קשה בעבודה', 'אבל עשיתי את זה', 'זו האמת אחי', 'חחח האשמתי את הכלב'])('allows %s', (m) => {
    expect(isSensitiveForReaction(m)).toBe(false);
  });
});

describe('router v3 crisis coverage', () => {
  it.each(['לפעמים אני חושב שעדיף שלא אהיה פה', 'אני לא אוכל כבר יומיים כדי לרדת מהר'])('%s → claude_crisis', (m) => {
    expect(routeV3(m, []).lane).toBe('claude_crisis');
  });
});
