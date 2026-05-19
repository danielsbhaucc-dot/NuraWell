import { describe, expect, it } from 'vitest';

import { detectChatSignals } from '../lib/ai/chat-signals';
import {
  formatChatSignalsPromptBlock,
  shouldInjectBlockerSignal,
} from '../lib/ai/chat-turn-context';

describe('chat-signals', () => {
  it('detects travel blocker and resignation', () => {
    const s = detectChatSignals(
      'לא שתיתי כי הייתי בנסיעות כל היום ולא הייתה לי גישה למים נקיים'
    );
    expect(s.blocker_mentioned).toBe(true);
    expect(s.main_blocker).toBe('נסיעות ולוגיסטיקה');
    expect(s.emotional_hint).toBeUndefined();
  });

  it('detects resigned tone', () => {
    const s = detectChatSignals('שוב ככה, מה כבר אפשר לעשות');
    expect(s.emotional_hint).toBe('resigned');
  });

  it('formats compact prompt block', () => {
    const s = detectChatSignals('עייפות ושינה גרועה, לא מצליח לקום');
    const block = formatChatSignalsPromptBlock(s);
    expect(block).toContain('[אות-עכשיו]');
    expect(block).toContain('עייפות');
  });

  it('skips duplicate blocker when already in daily block', () => {
    const s = detectChatSignals('הייתי בנסיעות כל היום');
    expect(
      shouldInjectBlockerSignal(s, "[יום] חסם:נסיעות ולוגיסטיקה · צ'אט:U:\"היי\"")
    ).toBe(false);
  });
});
