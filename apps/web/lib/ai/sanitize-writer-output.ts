/**
 * קלוד דרך OpenRouter לפעמים מחזיר הערות מערכת בסוגריים מרובעים במקום תוכן.
 * מנקים מטא בלי לגעת בתוכן עברי לגיטימי.
 */

const META_LINE_RE = /^\s*\[[^[\]]{0,500}\]\s*$/gm;
const PLACEHOLDER_RE = /\[\[[A-Z0-9_]+\]\]/g;
const LEADING_META_RE = /^\s*\[[^[\]]{1,500}\]\s*/;

export function sanitizeWriterOutput(text: string): string {
  if (!text) return '';
  let next = text.replace(PLACEHOLDER_RE, '').replace(META_LINE_RE, '').trim();
  next = next.replace(LEADING_META_RE, '').trim();
  next = next.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return next;
}

export function looksLikeBracketOnlyReply(text: string): boolean {
  const stripped = sanitizeWriterOutput(text);
  if (!stripped) return /\[/.test(text);
  const hebrew = (stripped.match(/[\u0590-\u05FF]/g) ?? []).length;
  return hebrew < 8 && /^\s*\[/.test(text.trim());
}
