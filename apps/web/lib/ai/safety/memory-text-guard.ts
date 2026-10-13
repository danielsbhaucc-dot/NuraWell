/**
 * Guard for text that is *stored* as long-term memory (insights, memory facts, period summaries).
 *
 * Some providers anonymise their output and leave tokens like "[PERSON_NAME]" / "[ADDRESS]" in the
 * middle of a sentence ("דניאל מרגיש [PERSON_NAME] לאחר ששכח לשתות מים"). Stripping the token leaves
 * a sentence with a hole whose meaning is lost, so stored memory must reject it instead.
 * In prod (13.10.2026) 15 of 22 user_insights rows were corrupted this way.
 */

const PLACEHOLDER_RE = /\[\[?\s*(?:[A-Z][A-Z0-9_]{1,48}|שם|כתובת|משימה)\s*\]\]?/;

export function hasPlaceholderCorruption(text: string | null | undefined): boolean {
  return PLACEHOLDER_RE.test(String(text ?? ''));
}

/** Text safe to store as memory: non-empty, no anonymiser placeholders. */
export function isStorableMemoryText(text: string | null | undefined, minLen = 4): boolean {
  const t = String(text ?? '').trim();
  return t.length >= minLen && !hasPlaceholderCorruption(t);
}
