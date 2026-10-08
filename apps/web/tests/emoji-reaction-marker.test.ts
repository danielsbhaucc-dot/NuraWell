import { describe, expect, it } from 'vitest';

import {
  encodeEmojiReactionMarker,
  extractEmojiReactionMarker,
  headerDecodeEmojiReaction,
  headerEncodeEmojiReaction,
  parseMentorEmojiReaction,
  stripEmojiReactionMarker,
} from '../lib/ai/emoji-reaction/marker';
import { heuristicEmojiReaction } from '../lib/ai/emoji-reaction/heuristic';
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

  it('round-trips ASCII-safe header encoding with Hebrew verb', () => {
    const encoded = headerEncodeEmojiReaction({ emoji: '🙏', verb: 'הודה' });
    expect(encoded.startsWith('{')).toBe(false);
    expect(/^[A-Za-z0-9+/=]+$/.test(encoded)).toBe(true);
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

describe('emoji reaction heuristic', () => {
  it('supports struggling users with a heart', () => {
    expect(heuristicEmojiReaction('קשה לי היום ואני צריך תמיכה')).toEqual({
      emoji: '💙',
      verb: 'תומך',
    });
  });

  it('celebrates completed tasks', () => {
    expect(heuristicEmojiReaction('סיימתי את כל המשימות להיום ואני גאה בעצמי')).toEqual({
      emoji: '💪',
      verb: 'חיזק',
    });
  });

  it('skips dry questions', () => {
    expect(heuristicEmojiReaction('מה השעה המומלצת לשתות מים?')).toBeNull();
  });
});
