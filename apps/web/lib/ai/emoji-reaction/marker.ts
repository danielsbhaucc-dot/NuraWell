/**
 * פרוטוקול הטמעת תגובת אימוג'י בזרם טקסט + header ASCII-safe (base64).
 */

import type { MentorEmojiReaction } from './types';

const MARKER_RE = /⟦NW_RX:(\{[\s\S]*?\})⟧/g;
/** אלמוג מתקן/מסיר תגובה קודמת שלו: ⟦NW_RX_FIX:{"e":"🙏"}⟧ או ⟦NW_RX_FIX:{"remove":true}⟧ */
const FIX_RE = /⟦NW_RX_FIX:(\{[\s\S]*?\})⟧/g;

function utf8ToBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function base64ToUtf8(value: string): string {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

function looksLikeEmoji(emoji: string): boolean {
  if (!emoji || emoji.length > 16) return false;
  // exactly one grapheme (❤️‍🩹 / 👍🏽 / 🇮🇱 count as one)
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const n = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(emoji)].length;
    if (n !== 1) return false;
  }
  if (/[A-Za-z\u0590-\u05FF]{3,}/.test(emoji)) return false;
  if (/\p{Extended_Pictographic}/u.test(emoji)) return true;
  if (/\p{Emoji_Presentation}/u.test(emoji)) return true;
  /** לבנים/כוכבים קלאסיים */
  return /[\u2764\u2665\u2605\u2728\u2B50]/.test(emoji);
}

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
  if (!looksLikeEmoji(emoji)) return null;
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
    .replace(FIX_RE, '')
    .replace(/⟦NW_RX_FIX:[^⟧]*$/, '')
    .replace(MARKER_RE, '')
    // unfinished marker while streaming
    .replace(/⟦NW_RX:[^⟧]*$/, '')
    // a model imitating the marker from history can leave a broken fragment (seen: `ישיר"}⟧לא מגזים`)
    .replace(/⟦NW_RX:[^⟧\n]*⟧?/g, '')
    .replace(/^[^\n⟦]{0,60}?"\s*\}\s*⟧/, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Header ASCII-safe — emoji/עברית ב-JSON גולמי נשברים ב-HTTP headers. */
export function headerEncodeEmojiReaction(reaction: MentorEmojiReaction): string {
  return utf8ToBase64(JSON.stringify({ emoji: reaction.emoji, verb: reaction.verb }));
}

export function headerDecodeEmojiReaction(raw: string | null | undefined): MentorEmojiReaction | null {
  if (!raw?.trim()) return null;
  const trimmed = raw.trim();
  try {
    if (trimmed.startsWith('{')) {
      return parseMentorEmojiReaction(JSON.parse(trimmed));
    }
    return parseMentorEmojiReaction(JSON.parse(base64ToUtf8(trimmed)));
  } catch {
    return null;
  }
}

export type EmojiReactionFix = { action: 'remove' } | { action: 'replace'; reaction: MentorEmojiReaction };

export function encodeEmojiReactionFix(fix: EmojiReactionFix): string {
  const payload = fix.action === 'remove' ? { remove: true } : { e: fix.reaction.emoji, v: fix.reaction.verb };
  return `⟦NW_RX_FIX:${JSON.stringify(payload)}⟧`;
}

/** מחלץ תיקון תגובה (האחרון בטקסט). */
export function extractEmojiReactionFix(text: string): EmojiReactionFix | null {
  if (!text) return null;
  FIX_RE.lastIndex = 0;
  let last: EmojiReactionFix | null = null;
  let match: RegExpExecArray | null;
  while ((match = FIX_RE.exec(text)) != null) {
    try {
      const raw = JSON.parse(match[1]!) as Record<string, unknown>;
      if (raw.remove === true) {
        last = { action: 'remove' };
        continue;
      }
      const reaction = parseMentorEmojiReaction(raw);
      if (reaction) last = { action: 'replace', reaction };
    } catch {
      /* ignore malformed */
    }
  }
  return last;
}
