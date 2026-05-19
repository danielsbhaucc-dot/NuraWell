import { describe, expect, it } from 'vitest';

import { detectTaskIntent } from '../lib/ai/chat-task-intent';
import { formatTaskIntentPromptBlock } from '../lib/ai/chat-turn-context';

const pending = [
  { id: 't1', title: 'הליכה 10 דקות', stepId: 's1', stepTitle: 'צעד 1' },
];

describe('chat-task-intent', () => {
  it('detects task completion', () => {
    expect(detectTaskIntent('עשיתי את ההליכה עכשיו', pending).kind).toBe('done');
    expect(detectTaskIntent('ביצעתי את המשימה', pending).kind).toBe('done');
  });

  it('formats prompt block', () => {
    const intent = detectTaskIntent('סיימתי את ההליכה', pending);
    const block = formatTaskIntentPromptBlock(intent);
    expect(block).toContain('[משימה:');
  });

  it('ignores negative phrasing', () => {
    expect(detectTaskIntent('לא עשיתי עדיין', pending).kind).toBe('none');
  });
});
