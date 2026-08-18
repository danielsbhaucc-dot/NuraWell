/**
 * ניקוי פלט כותב: placeholders, מטא בסוגריים, ודליפת חשיבה פנימית.
 * מודלים חושבים (Qwen/GPT) לפעמים שולחים את ה-CoT כהודעת צ'אט באנגלית.
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

const THINK_TAG_RE =
  /<\s*(?:think|thinking|thought|reasoning)\s*>[\s\S]*?<\s*\/\s*(?:think|thinking|thought|reasoning)\s*>/gi;

const UNCLOSED_THINK_OPEN_RE = /<\s*(?:think|thinking|thought|reasoning)\s*>/i;

const THINK_FENCE_RE = /```(?:think|thinking|thought|reasoning)\s*[\s\S]*?```/gi;

/**
 * ניסוחי תכנון פנימי שדולפים כהודעה —
 * "the user claimed X, maybe I should..., I'll go with Y".
 */
const COT_PHRASE_RE =
  /\b(?:the user (?:said|claimed|mentioned|asked|wants|is|has|told|listed)|user (?:said|claimed|mentioned|asked|wants)|maybe I should|I should (?:respond|reply|say|go|answer|choose|be)|I(?:'ll| will) (?:go with|respond|reply|say)|let me think|my (?:thinking|reasoning|thoughts)|perhaps I (?:should|could|can)|I could (?:respond|reply|say)|the best (?:approach|response|option)|looking at (?:the )?(?:conversation|context|message)|based on (?:the )?(?:system|prompt|instructions|context)|I need to (?:respond|decide|choose|figure)|wait,? the user|the user is (?:trying|asking|feeling|claiming)|I(?:'m| am) (?:thinking|considering|leaning)|option [123abc]|alternatively,? I|first,? I (?:should|need|will)|I have (?:two|three|several) (?:options|ways))\b/i;

const HEBREW_COT_PHRASE_RE =
  /(?:המשתמש (?:טען|אמר|ביקש|רשם|מנה)|אולי עלי[יך]? להגיב|אלך על (?:זה|האפשרות)|בואו נחשוב|החשיבה שלי|אפשרות [אב1]|אולי ככה ואולי)/;

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

function letterCounts(text: string): { latin: number; hebrew: number } {
  return {
    latin: (text.match(/[A-Za-z]/g) ?? []).length,
    hebrew: (text.match(/[\u0590-\u05FF]/g) ?? []).length,
  };
}

function latinRatio(text: string): number {
  const { latin, hebrew } = letterCounts(text);
  const total = latin + hebrew;
  if (total === 0) return 0;
  return latin / total;
}

function cotHitCount(text: string): number {
  const matches = text.match(new RegExp(COT_PHRASE_RE.source, 'gi'));
  const hebrewMatches = text.match(new RegExp(HEBREW_COT_PHRASE_RE.source, 'g'));
  return (matches?.length ?? 0) + (hebrewMatches?.length ?? 0);
}

function isCotBlob(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (UNCLOSED_THINK_OPEN_RE.test(t)) return true;
  const hits = cotHitCount(t);
  if (hits >= 2) return true;
  if (hits >= 1 && latinRatio(t) >= 0.45) return true;
  return false;
}

function stripThinkBlocks(text: string): string {
  return text.replace(THINK_TAG_RE, '\n').replace(THINK_FENCE_RE, '\n');
}

/** חותך קידומת תכנון לטינית כשהתשובה העברית באותה פסקה. */
function peelCotPrefix(text: string): string {
  const hebrewStart = text.search(/[\u0590-\u05FF]/);
  if (hebrewStart < 0) return isCotBlob(text) ? '' : text;
  if (hebrewStart === 0) return text;
  const prefix = text.slice(0, hebrewStart).trim();
  const rest = text.slice(hebrewStart).trim();
  if (!prefix) return text;
  if (isCotBlob(prefix) || latinRatio(prefix) >= 0.65) return rest;
  return text;
}

function stripCotPrefixAndParagraphs(text: string): string {
  const blocks = text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);

  if (blocks.length <= 1) {
    const lines = text.split('\n');
    const keptLines: string[] = [];
    let seenKeepable = false;
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        if (seenKeepable) keptLines.push(line);
        continue;
      }
      if (!seenKeepable && isCotBlob(trimmed)) continue;
      seenKeepable = true;
      keptLines.push(line);
    }
    return keptLines.join('\n').trim();
  }

  const kept: string[] = [];
  let seenKeepable = false;
  for (const block of blocks) {
    if (!seenKeepable && isCotBlob(block)) continue;
    seenKeepable = true;
    kept.push(block);
  }
  return kept.join('\n\n').trim();
}

export function sanitizeWriterOutput(text: string): string {
  if (!text) return '';
  let next = stripThinkBlocks(text)
    .replace(DOUBLE_PLACEHOLDER_RE, '')
    .replace(SINGLE_CAPS_PLACEHOLDER_RE, '')
    .replace(NAMED_PLACEHOLDER_RE, '')
    .replace(ENGLISH_META_BRACKET_RE, '')
    .replace(META_LINE_RE, '')
    .trim();
  next = next.replace(LEADING_META_RE, '').trim();
  next = stripCotPrefixAndParagraphs(peelCotPrefix(next));
  return collapsePlaceholderGaps(next);
}

export function looksLikeBracketOnlyReply(text: string): boolean {
  const stripped = sanitizeWriterOutput(text);
  if (!stripped) return /\[/.test(text);
  const hebrew = (stripped.match(/[\u0590-\u05FF]/g) ?? []).length;
  return hebrew < 8 && /^\s*\[/.test(text.trim());
}

/**
 * האם הפלט הוא בעיקר חשיבה פנימית שדלפה (ולא הודעת אלמוג).
 * אחרי sanitize: אם נשארה עברית אמיתית — זה לא "רק מחשבות".
 */
export function looksLikeLeakedThinking(text: string): boolean {
  const raw = text?.trim() ?? '';
  if (!raw) return false;
  if (UNCLOSED_THINK_OPEN_RE.test(raw) && !/<\s*\/\s*(?:think|thinking|thought|reasoning)\s*>/i.test(raw)) {
    const afterOpen = raw.replace(/^[\s\S]*?<\s*(?:think|thinking|thought|reasoning)\s*>/i, '');
    if (!afterOpen.trim() || isCotBlob(afterOpen)) return true;
  }
  const cleaned = sanitizeWriterOutput(raw);
  if (cleaned) {
    const { hebrew, latin } = letterCounts(cleaned);
    if (hebrew >= 8 && !isCotBlob(cleaned)) return false;
    return (
      isCotBlob(cleaned) ||
      (latinRatio(cleaned) >= 0.7 && cotHitCount(cleaned) >= 1) ||
      (hebrew < 8 && latin >= 40)
    );
  }
  return isCotBlob(raw) || latinRatio(raw) >= 0.72;
}

/**
 * האם עדיין באמצע בלוק חשיבה — לא להתחיל סטרימינג ללקוח.
 * גם קידומת לטינית בלי עברית נחסמת: אחרת "The u…" בורח ללקוח לפני שמזהים CoT.
 */
export function shouldHoldStreamForThinking(prefix: string): boolean {
  const t = prefix?.trim() ?? '';
  if (!t) return false;
  if (UNCLOSED_THINK_OPEN_RE.test(t) && !/<\s*\/\s*(?:think|thinking|thought|reasoning)\s*>/i.test(t)) {
    return true;
  }
  const cleaned = sanitizeWriterOutput(t);
  const counts = letterCounts(cleaned || t);
  if (counts.hebrew >= 4) return false;
  if (counts.latin >= 6) return true;
  return looksLikeLeakedThinking(t) || isCotBlob(t);
}

/**
 * כמו sanitizeWriterOutput, בלי להחזיר את המקור אם נשאר רק מטא/חשיבה.
 */
/** קידומת לטינית בלי עברית — כנראה מחשבות שעדיין לא זוהו כ-CoT מלא. */
function isLatinOnlyThinkingPrefix(raw: string): boolean {
  const t = raw.trim();
  if (!t) return false;
  const { hebrew, latin } = letterCounts(t);
  if (hebrew > 0) return false;
  if (latin < 6) return false;
  return isCotBlob(t) || latinRatio(t) >= 0.85;
}

export function preferSanitizedWriterOutput(raw: string): string {
  const cleaned = sanitizeWriterOutput(raw);
  if (!cleaned) {
    if (
      looksLikeLeakedThinking(raw) ||
      looksLikeBracketOnlyReply(raw) ||
      isCotBlob(raw) ||
      isLatinOnlyThinkingPrefix(raw)
    ) {
      return '';
    }
    return raw.trim();
  }
  return looksLikeLeakedThinking(cleaned) ? '' : cleaned;
}
