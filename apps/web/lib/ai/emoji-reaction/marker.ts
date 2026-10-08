/**
 * פרוטוקול הטמעת תגובת אימוג'י בזרם טקסט (TextStream / UI stream).
 * הסימון מוסר לפני תצוגה ולפני שמירת תשובת העוזר.
 */

import type { MentorEmojiReaction } from './types';

const MARKER_RE = /⟦NW_RX:(\{[\s\S]*?\})⟧/g;

/** אימוג'י / רצף אימוג'י סביר — לא אותיות/ספרות בלבד. */
const EMOJI_CANDIDATE_RE =
  /^(?:[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F\u200D\u20E3\u{1F3FB}-\u{1F3FF}])+$/u;

export function encodeEmojiReactionMarker(reaction: MentorEmojiReaction): string {
  const payload = JSON.stringify({ e: reaction.emoji, v: reaction.verb });
  return `⟦NW_RX:${payload}⟧`;
}

export function parseMentorEmojiReaction(raw: unknown): MentorEmojiReaction | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const emoji =
    typeof row.emoji === 'string'
      ? row.emoji.trim()
      : typeof row.e === 'string'
        ? row.e.trim()
        : '';
  const verb =
    typeof row.verb === 'string'
      ? row.verb.trim()
      : typeof row.v === 'string'
        ? row.v.trim()
        : '';
  if (!emoji || emoji.length > 16) return null;
  if (!EMOJI_CANDIDATE_RE.test(emoji) && !/\p{Extended_Pictographic}/u.test(emoji)) {
    return null;
  }
  if (/[A-Za-z\u0590-\u05FF]{3,}/.test(emoji)) return null;
  const safeVerb = (verb || 'הגיב עם').slice(0, 24);
  return { emoji, verb: safeVerb };
}

export function extractEmojiReactionMarker(text: string): MentorEmojiReaction | null {
  if (!text) return null;
  MARKER_RE.lastIndex = 0;
  let last: MentorEmojiReaction | null = null;
  let match: RegExpExecArray | null;
  while ((match = MARKER_RE.exec(text)) != null) {
    try {
      const parsed = parseMentorEmojiReaction(JSON.parse(match[1]!));
      if (parsed) last = parsed;
    } catch {
      /* ignore malformed marker */
    }
  }
  return last;
}

export function stripEmojiReactionMarker(text: string): string {
  if (!text) return text;
  return text
    .replace(MARKER_RE, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function headerEncodeEmojiReaction(reaction: MentorEmojiReaction): string {
  return JSON.stringify({ emoji: reaction.emoji, verb: reaction.verb });
}

export function headerDecodeEmojiReaction(raw: string | null | undefined): MentorEmojiReaction | null {
  if (!raw?.trim()) return null;
  try {
    return parseMentorEmojiReaction(JSON.parse(raw));
  } catch {
    return null;
  }
}
