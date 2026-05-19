import { describe, expect, it } from 'vitest';

import {
  detectHabitIntent,
  detectWaterHabitCompletionIntent,
} from '../lib/ai/chat-habit-intent';
import { formatHabitIntentPromptBlock } from '../lib/ai/chat-turn-context';

const habits = [
  { id: 'h1', title: 'שתיית מים יומית' },
  { id: 'h2', title: 'הליכה 10 דקות' },
];

describe('chat-habit-intent', () => {
  it('detects explicit water completion', () => {
    expect(detectWaterHabitCompletionIntent('שתיתי כוס מים עכשיו')).toBe(true);
    expect(detectHabitIntent('עשיתי את המים לפני ארוחה', habits).kind).toBe('done');
  });

  it('detects miss on travel / no water', () => {
    const intent = detectHabitIntent(
      'לא שתיתי כי הייתי בנסיעות כל היום ולא הייתה לי גישה למים נקיים',
      habits
    );
    expect(intent.kind).toBe('miss');
    expect(intent.habitTitle).toMatch(/מים/);
    const block = formatHabitIntentPromptBlock(intent);
    expect(block).toContain('לא]');
  });

  it('does not mark excuses or future intent as done', () => {
    expect(
      detectHabitIntent(
        'לא שתיתי כי הייתי בנסיעות כל היום ולא הייתה לי גישה למים נקיים',
        habits
      ).kind
    ).toBe('miss');
    expect(detectHabitIntent('אשתה מחר בבוקר', habits).kind).toBe('none');
    expect(detectHabitIntent('צריך לשתות יותר', habits).kind).toBe('none');
  });

  it('detects walk habit completion when referenced', () => {
    expect(detectHabitIntent('עשיתי הליכה 10 דקות עכשיו', habits).kind).toBe('done');
  });
});
