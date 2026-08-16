/**
 * קלוד דרך OpenRouter לפעמים מדליף placeholders / הערות מערכת בסוגריים מרובעים.
 * מנקים מטא בלי לגעת בתוכן עברי לגיטימי.
 */

/** שורה שלמה שהיא רק [מטא] */
const META_LINE_RE = /^\s*\[[^[\]]{0,500}\]\s*$/gm;

/** PII shield: [[USER_FIRST_NAME]] */
const DOUBLE_PLACEHOLDER_RE = /\[\[[A-Z0-9_\s]+\]\]/gi;

/**
 * Placeholders באנגלית בסוגריים יחידים באמצע משפט —
 * Claude ממציא לעיתים [PERSON_NAME] / [ADDRESS] במקום שם אמיתי.
 */
const SINGLE_CAPS_PLACEHOLDER_RE = /\[\s*[A-Z][A-Z0-9_]{1,48}\s*\]/g;

/** וריאציות עבריות/כלליות נפוצות */
const NAMED_PLACEHOLDER_RE =
  /\[\s*(?:שם|כתובת|משימה|טאסק|Task|NAME|ADDRESS|FIRST_?NAME|PERSON|USER)\s*\]/gi;

/** מטא באנגלית בסוגריים (שורה או באמצע) */
const ENGLISH_META_BRACKET_RE =
  /\[[^[\]]{0,120}(?:user|assistant|system|note|instruction|empathy|meta|thinking)[^[\]]{0,120}\]/gi;

const LEADING_META_RE = /^\s*\[[^[\]]{1,500}\]\s*/;

function collapsePlaceholderGaps(text: string): string {
  return text
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ +([.,!?;:…])/g, '$1')
    .replace(/\( +/g, '(')
    .replace(/ +\)/g, ')')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function sanitizeWriterOutput(text: string): string {
  if (!text) return '';
  let next = text
    .replace(DOUBLE_PLACEHOLDER_RE, '')
    .replace(SINGLE_CAPS_PLACEHOLDER_RE, '')
    .replace(NAMED_PLACEHOLDER_RE, '')
    .replace(ENGLISH_META_BRACKET_RE, '')
    .replace(META_LINE_RE, '')
    .trim();
  next = next.replace(LEADING_META_RE, '').trim();
  return collapsePlaceholderGaps(next);
}

export function looksLikeBracketOnlyReply(text: string): boolean {
  const stripped = sanitizeWriterOutput(text);
  if (!stripped) return /\[/.test(text);
  const hebrew = (stripped.match(/[\u0590-\u05FF]/g) ?? []).length;
  return hebrew < 8 && /^\s*\[/.test(text.trim());
}
