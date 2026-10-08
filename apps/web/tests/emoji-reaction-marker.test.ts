import { describe, expect, it } from 'vitest';

import {
  encodeEmojiReactionMarker,
  extractEmojiReactionMarker,
  headerDecodeEmojiReaction,
  headerEncodeEmojiReaction,
  parseMentorEmojiReaction,
  stripEmojiReactionMarker,
} from '../lib/ai/emoji-reaction/marker';
import {
  detectReactionSignal,
  heuristicEmojiReaction,
  pickFallbackReaction,
} from '../lib/ai/emoji-reaction/heuristic';
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

describe('emoji reaction heuristic intelligence', () => {
  it('detects support intent without locking a single emoji', () => {
    const signal = detectReactionSignal('קשה לי היום ואני צריך תמיכה');
    expect(signal?.intent).toBe('support');
    expect(signal?.mustReact).toBe(true);
  });

  it('picks topic-specific micro-win emoji for water', () => {
    expect(pickFallbackReaction('micro_win', 'שתיתי 3 כוסות מים')).toEqual({
      emoji: '💧',
      verb: 'ציין',
    });
  });

  it('picks topic-specific micro-win emoji for walking', () => {
    expect(pickFallbackReaction('micro_win', 'הלכתי 20 דקות היום')).toEqual({
      emoji: '🚶',
      verb: 'מחא כפיים',
    });
  });

  it('varies celebrate fallbacks beyond a single muscle emoji', () => {
    const a = pickFallbackReaction('celebrate', 'סיימתי את כל המשימות להיום');
    const b = pickFallbackReaction('celebrate', 'שברתי שיא אישי היום');
    expect(['💪', '🏆', '🎉', '🌟', '🚀', '🔥', '🙌', '✨']).toContain(a.emoji);
    expect(['💪', '🏆', '🎉', '🌟', '🚀', '🔥', '🙌', '✨']).toContain(b.emoji);
  });

  it('supports struggling users with a must-react fallback', () => {
    const reaction = heuristicEmojiReaction('קשה לי היום ואני צריך תמיכה');
    expect(reaction).not.toBeNull();
    expect(['💙', '🤗', '🫂', '🤍', '🌧️', '🕊️', '🩵', '🥺']).toContain(reaction!.emoji);
  });

  it('skips dry questions', () => {
    expect(heuristicEmojiReaction('מה השעה המומלצת לשתות מים?')).toBeNull();
    expect(detectReactionSignal('מה השעה המומלצת לשתות מים?')).toBeNull();
  });
});
