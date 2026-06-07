import { describe, expect, it } from 'vitest';
import {
  formatJourneyChatGuidanceBlock,
  formatPendingAcceptedTasksPromptBlock,
  isCasualGreeting,
} from '../lib/ai/chat-turn-context';

describe('isCasualGreeting', () => {
  it('detects short Hebrew greetings', () => {
    expect(isCasualGreeting('היי')).toBe(true);
    expect(isCasualGreeting('שלום!')).toBe(true);
  });

  it('rejects longer messages', () => {
    expect(isCasualGreeting('היי איך אתה מרגיש היום')).toBe(false);
  });
});

describe('formatJourneyChatGuidanceBlock', () => {
  it('includes greeting hint when relevant', () => {
    const block = formatJourneyChatGuidanceBlock({
      journeyData: { step: 'צעד 1', habits: ['✓מים'], tasks: ['○משימה'] },
      isGreeting: true,
    });
    expect(block).toContain('✓');
    expect(block).toContain('פתיחה');
  });
});

describe('formatPendingAcceptedTasksPromptBlock', () => {
  it('nudges one concrete accepted task on greeting turns', () => {
    const block = formatPendingAcceptedTasksPromptBlock(
      [
        {
          id: 'task-1',
          title: 'הליכה 10 דקות',
          stepId: 'step-1',
          stepTitle: 'תנועה קלה',
          schedule: 'daily',
          times_per_day: 1,
        },
      ],
      { isGreeting: true }
    );

    expect(block).toContain('הליכה 10 דקות');
    expect(block).toContain('פתיחה/ברכה');
    expect(block).toContain('צעד קטן');
  });
});
