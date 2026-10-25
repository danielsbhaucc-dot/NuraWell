/**
 * Server-side validation of memory_text, applied to the PLAINTEXT before encryption.
 * The DB can no longer check the length (the column stores ciphertext), so this is the only gate.
 */
export const MEMORY_TEXT_MIN = 4;
export const MEMORY_TEXT_MAX = 600;

/** Normalizes whitespace and caps at MEMORY_TEXT_MAX; returns null when shorter than MEMORY_TEXT_MIN. */
export function normalizeMemoryText(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const text = Array.from(raw.replace(/\s+/g, ' ').trim()).slice(0, MEMORY_TEXT_MAX).join('').trim();
  return Array.from(text).length >= MEMORY_TEXT_MIN ? text : null;
}
