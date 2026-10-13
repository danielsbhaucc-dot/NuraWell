import { describe, expect, it } from 'vitest';
import { buildRepetitionHint } from '@/lib/ai/repetition-hint';
import { stripEmojiReactionMarker, parseMentorEmojiReaction, encodeEmojiReactionMarker } from '@/lib/ai/emoji-reaction/marker';

describe('repetition hint', () => {
  const now = Date.parse('2026-10-13T14:40:00Z');
  const p = (c: string, s: string, d = '2026-10-13T14:39:00Z') => ({ content: c, sessionId: s, createdAt: d });
  it('fires on repeated request in session', () => {
    const h = buildRepetitionHint('תשלח לי תפריט', [p('תשלח לי תפריט קדימה', 'a'), p('אלמוג תכין לי תפריט למחר', 'a'), p('תביא לי תפריט', 'a')], { sessionId: 'a', now });
    expect(h).toMatch(/^\[חזרה\]/);
  });
  it('fires across sessions', () => {
    expect(buildRepetitionHint('אין לי כוח להליכה', [p('אין לי כוח להליכה היום', 'x', '2026-10-10T10:00:00Z'), p('אין כוח להליכה', 'y', '2026-10-08T10:00:00Z')], { sessionId: 'a', now })).toContain('בשיחות קודמות');
  });
  it('silent otherwise', () => {
    expect(buildRepetitionHint('שתיתי היום מים', [p('הלכתי לישון מוקדם', 'a')], { sessionId: 'a', now })).toBeNull();
  });
});

describe('emoji marker', () => {
  it('strips mid/partial/broken markers', () => {
    const m = encodeEmojiReactionMarker({ emoji: '🫂', verb: 'תומך' });
    expect(stripEmojiReactionMarker(`ה${m}יי`)).toBe('היי');
    expect(stripEmojiReactionMarker('שלום ⟦NW_RX:{"e":"')).toBe('שלום');
    expect(stripEmojiReactionMarker('ישיר"}⟧לא מגזים')).toBe('לא מגזים');
  });
  it('only a single emoji grapheme', () => {
    expect(parseMentorEmojiReaction({ emoji: '❤️‍🩹', verb: 'x' })).not.toBeNull();
    expect(parseMentorEmojiReaction({ emoji: '👍🏽', verb: 'x' })).not.toBeNull();
    expect(parseMentorEmojiReaction({ emoji: '🔥🔥', verb: 'x' })).toBeNull();
    expect(parseMentorEmojiReaction({ emoji: 'ok', verb: 'x' })).toBeNull();
  });
});
