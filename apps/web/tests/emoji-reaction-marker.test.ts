import { describe, expect, it } from 'vitest';

import {
  encodeEmojiReactionMarker,
  extractEmojiReactionMarker,
  headerDecodeEmojiReaction,
  headerEncodeEmojiReaction,
  parseMentorEmojiReaction,
  stripEmojiReactionMarker,
} from '../lib/ai/emoji-reaction/marker';
import { formatMentorReactionTooltip } from '../lib/ai/emoji-reaction/types';
import {
  extractDisplayTextFromChatMessage,
  extractEmojiReactionFromChatMessage,
} from '../lib/client/chat-message-display';

describe('emoji reaction marker', () => {
  it('encodes and extracts a reaction', () => {
    const marker = encodeEmojiReactionMarker({ emoji: '❤️', verb: 'אהב' });
    const text = `${marker}היי, כל הכבוד על הצעד.`;
    expect(extractEmojiReactionMarker(text)).toEqual({ emoji: '❤️', verb: 'אהב' });
    expect(stripEmojiReactionMarker(text)).toBe('היי, כל הכבוד על הצעד.');
  });

  it('rejects laughing emoji-looking text without pictograph', () => {
    expect(parseMentorEmojiReaction({ emoji: 'lol', verb: 'צחק' })).toBeNull();
  });

  it('formats mentor tooltip', () => {
    expect(formatMentorReactionTooltip({ emoji: '💪', verb: 'חיזק' })).toBe('אלמוג חיזק 💪');
  });

  it('round-trips header encoding', () => {
    const encoded = headerEncodeEmojiReaction({ emoji: '🙏', verb: 'הודה' });
    expect(headerDecodeEmojiReaction(encoded)).toEqual({ emoji: '🙏', verb: 'הודה' });
  });

  it('strips marker from chat display text and exposes reaction', () => {
    const marker = encodeEmojiReactionMarker({ emoji: '💙', verb: 'הזדהה' });
    const msg = {
      role: 'assistant' as const,
      parts: [{ type: 'text' as const, text: `${marker}אני איתך.` }],
    };
    expect(extractDisplayTextFromChatMessage(msg)).toBe('אני איתך.');
    expect(extractEmojiReactionFromChatMessage(msg)).toEqual({ emoji: '💙', verb: 'הזדהה' });
  });
});
