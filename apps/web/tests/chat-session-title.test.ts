import { describe, expect, it } from 'vitest';

import { fallbackLiveConversationFile } from '../lib/ai/chat-conversation-file';
import {
  sanitizeChatSessionTitle,
  titleFromSummaryFallback,
} from '../lib/ai/chat-sessions/session-title';

describe('sanitizeChatSessionTitle', () => {
  it('strips quotes and trailing period', () => {
    expect(sanitizeChatSessionTitle('"מים בבוקר".')).toBe('מים בבוקר');
  });

  it('rejects generic titles', () => {
    expect(sanitizeChatSessionTitle('שיחה עם אלמוג')).toBeNull();
    expect(sanitizeChatSessionTitle('אלמוג')).toBeNull();
  });

  it('collapses whitespace and newlines', () => {
    expect(sanitizeChatSessionTitle('  לחץ\nבעבודה  ')).toBe('לחץ בעבודה');
  });
});

describe('titleFromSummaryFallback', () => {
  it('takes the first sentence', () => {
    expect(titleFromSummaryFallback('דיברנו על מים. אחר כך על שינה.')).toBe('דיברנו על מים');
  });
});

describe('fallbackLiveConversationFile', () => {
  it('creates a structured file on first turn', () => {
    const file = fallbackLiveConversationFile({
      userMessage: 'קשה לי היום',
      assistantMessage: 'אני איתך. נתחיל בכוס מים.',
      turnAt: '2026-06-16T08:00:00.000Z',
    });
    expect(file).toContain('נפתח:');
    expect(file).toContain('קשה לי היום');
    expect(file).toContain('אני איתך');
  });

  it('appends to an existing file', () => {
    const file = fallbackLiveConversationFile({
      previousFile: 'נפתח: אתמול',
      userMessage: 'עוד משהו',
      assistantMessage: 'בסדר',
      turnAt: '2026-06-16T08:00:00.000Z',
    });
    expect(file).toContain('נפתח: אתמול');
    expect(file).toContain('עוד משהו');
    expect(file).toContain('בסדר');
  });
});
