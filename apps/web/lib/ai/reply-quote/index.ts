/**
 * WhatsApp-style reply quoting for Almog.
 *
 * Protocol: the writer may start its reply with ⟦NW_RQ:n⟧ where n is a short LOCAL index
 * (1 = the latest user message, 2 = the one before it, ...). No message ids or extra content
 * ever go to the AI provider. The server validates n against the same user+session transcript
 * and stores only the referenced message id (ai_interactions.reply_to_message_id). The quote
 * snippet itself is never stored: the client renders it from the already-decrypted original.
 */

export const REPLY_QUOTE_MAX_BACK = 6;
const MARKER_RE = /⟦NW_RQ:(\d{1,2})⟧/;
const MARKER_ALL_RE = /⟦NW_RQ:\d{0,2}⟧/g;
/** A marker cut mid-stream ("⟦NW_R", "⟦NW_RQ:2") at the very end of the text so far. */
const PARTIAL_TAIL_RE = /⟦(?:N(?:W(?:_(?:R(?:Q(?::\d{0,2})?)?)?)?)?)?$/;

export type QuoteTurn = { role: string; content?: string };

export function extractReplyQuoteIndex(text: string | null | undefined): number | null {
  if (!text) return null;
  const m = MARKER_RE.exec(text);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isInteger(n) && n >= 1 && n <= REPLY_QUOTE_MAX_BACK ? n : null;
}

export function stripReplyQuoteMarker(text: string): string {
  if (!text || !text.includes('⟦')) return text;
  return text.replace(MARKER_ALL_RE, '').replace(PARTIAL_TAIL_RE, '').replace(/^\s+/, '');
}

/** Number of consecutive user messages at the end of the turns (the current "burst"). */
export function trailingUserBurst(turns: QuoteTurn[]): number {
  let n = 0;
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    if (turns[i]!.role === 'user') n += 1;
    else if (turns[i]!.role === 'assistant') break;
  }
  return n;
}

/** Indices (into turns) of user messages, latest first. */
export function userTurnIndicesLatestFirst(turns: QuoteTurn[]): number[] {
  const out: number[] = [];
  for (let i = turns.length - 1; i >= 0 && out.length < REPLY_QUOTE_MAX_BACK; i -= 1) {
    if (turns[i]!.role === 'user') out.push(i);
  }
  return out;
}

/**
 * Policy (enforced server- and client-side, not only in the prompt):
 * - n must point at one of the last REPLY_QUOTE_MAX_BACK user messages.
 * - n = 1 (the latest message) is only allowed when the user sent a burst (≥2 messages in a row);
 *   a single latest message answered directly is never quoted.
 */
export function isReplyQuoteAllowed(turns: QuoteTurn[], n: number | null): boolean {
  if (n == null || !Number.isInteger(n) || n < 1 || n > REPLY_QUOTE_MAX_BACK) return false;
  const users = userTurnIndicesLatestFirst(turns);
  if (n > users.length) return false;
  if (n === 1 && trailingUserBurst(turns) < 2) return false;
  return true;
}

/** Index into turns of the quoted user message, or null when the quote is not allowed. */
export function resolveReplyQuoteTurnIndex(turns: QuoteTurn[], n: number | null): number | null {
  if (!isReplyQuoteAllowed(turns, n)) return null;
  return userTurnIndicesLatestFirst(turns)[n! - 1] ?? null;
}

function snippet(s: string): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > 40 ? `${t.slice(0, 40)}…` : t;
}

/**
 * Short prompt block, only when quoting could actually help (a burst, or enough history for
 * "answering an older question"). Snippets are of messages already in the writer's history,
 * so nothing new is sent to the provider. Returns null otherwise (saves tokens and makes
 * quoting on simple single-message turns impossible by construction).
 */
export function buildReplyQuotePromptBlock(turns: QuoteTurn[]): string | null {
  const users = userTurnIndicesLatestFirst(turns);
  const burst = trailingUserBurst(turns);
  if (users.length < 2 || (burst < 2 && users.length < 3)) return null;
  const list = users.map((idx, k) => `[${k + 1}] "${snippet(String(turns[idx]!.content ?? ''))}"`).join('\n');
  return [
    '— ציטוט הודעה (כמו בוואטסאפ) —',
    'אפשר לצטט הודעה קודמת של המשתמש רק כשזה באמת מוסיף בהירות. ברוב התשובות לא מצטטים.',
    'מתי כן: המשתמש שלח כמה הודעות ברצף ואתה עונה לאחת מהן; אתה חוזר לשאלה ישנה אחרי שהנושא התקדם; יש עמימות למה אתה מתכוון.',
    'מתי לא: הודעה אחת אחרונה שאתה עונה עליה ישירות. לא מצטטים סתם ולא בכל תשובה.',
    'איך: בתחילת התשובה, לפני כל טקסט, כתוב ⟦NW_RQ:n⟧ כש-n הוא המספר מהרשימה (1 = ההודעה האחרונה). ציטוט אחד לכל היותר. אל תעתיק את ההודעה עצמה, המערכת מציגה אותה.',
    'דוגמאות:',
    '- המשתמש כתב "אכלתי פיצה" ואז "וגם שאלה, כמה מים לשתות?" ואתה עונה קודם על המים: ⟦NW_RQ:1⟧ ואז התשובה.',
    '- לפני כמה הודעות הוא שאל על שינה ועכשיו הנושא אחר, ואתה חוזר לשינה: ⟦NW_RQ:3⟧ ואז התשובה.',
    '- הודעה אחת "היי, מה שלומך?": בלי ציטוט.',
    'ההודעות האחרונות של המשתמש:',
    list,
  ].join('\n');
}
