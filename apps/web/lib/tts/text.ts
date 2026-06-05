import { createHash } from 'node:crypto';
import { TTS_MODEL_ID, TTS_VOICE_ID } from './constants';

/** Normalize question text before hashing / TTS. */
export function normalizeTtsText(text: string): string {
  return text.trim().replace(/\s+/g, ' ').normalize('NFC');
}

/** Short hash — changes only when text/voice/model changes (cache key + skip regen). */
export function computeTtsContentHash(text: string): string {
  const payload = `${TTS_MODEL_ID}|${TTS_VOICE_ID}|${normalizeTtsText(text)}`;
  return createHash('sha256').update(payload, 'utf8').digest('hex').slice(0, 16);
}

/** Wrap with Eleven v3 audio tags for energetic, encouraging Hebrew speech. */
export function prepareTtsPrompt(questionText: string): string {
  const clean = normalizeTtsText(questionText);
  if (!clean) return '';
  return `[excited][warmly] ${clean}`;
}
