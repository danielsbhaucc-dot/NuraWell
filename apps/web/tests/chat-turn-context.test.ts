import { describe, expect, it } from 'vitest';
import {
  formatJourneyChatGuidanceBlock,
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
