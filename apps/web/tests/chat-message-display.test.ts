import { describe, expect, it } from 'vitest';

import {
  assistantMessageHasDisplayText,
  extractDisplayTextFromChatMessage,
  messageIsToolOnlyAssistant,
  stripStreamProtocolArtifacts,
} from '../lib/client/chat-message-display';

describe('extractDisplayTextFromChatMessage', () => {
  it('prefers text parts over legacy content', () => {
    const text = extractDisplayTextFromChatMessage({
      role: 'assistant',
      content: '{"type":"tool-call"}',
      parts: [{ type: 'text', text: 'שלום, איך אפשר לעזור?' }],
    });
    expect(text).toBe('שלום, איך אפשר לעזור?');
  });

  it('returns empty for tool-only assistant messages', () => {
    const text = extractDisplayTextFromChatMessage({
      role: 'assistant',
      parts: [
        {
          type: 'tool-recall_past_memory',
          state: 'input-available',
          toolCallId: 'tc_1',
        },
      ],
    });
    expect(text).toBe('');
    expect(messageIsToolOnlyAssistant({ role: 'assistant', parts: [{ type: 'tool-recall_past_memory' }] })).toBe(
      true
    );
  });

  it('concatenates multiple text parts', () => {
    const text = extractDisplayTextFromChatMessage({
      role: 'assistant',
      parts: [
        { type: 'text', text: 'חלק א. ' },
        { type: 'text', text: 'חלק ב.' },
      ],
    });
    expect(text).toBe('חלק א. חלק ב.');
  });

  it('strips stream protocol artifacts from content fallback', () => {
    const dirty = '0:{"type":"text-delta","text":"היי"}\n1:{"type":"tool-input-start"}';
    expect(stripStreamProtocolArtifacts(dirty)).toBe('');
  });

  it('keeps normal Hebrew content in content fallback', () => {
    const text = extractDisplayTextFromChatMessage({
      role: 'assistant',
      content: 'בוא נתקדם צעד קטן היום.',
    });
    expect(text).toBe('בוא נתקדם צעד קטן היום.');
  });

  it('detects assistant display text', () => {
    expect(
      assistantMessageHasDisplayText({
        role: 'assistant',
        parts: [{ type: 'text', text: 'מוכן' }],
      })
    ).toBe(true);
    expect(
      assistantMessageHasDisplayText({
        role: 'assistant',
        parts: [{ type: 'tool-recall_past_memory', state: 'output-available' }],
      })
    ).toBe(false);
  });
});
