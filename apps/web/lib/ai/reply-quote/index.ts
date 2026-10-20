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
/** Bubble split marker: Almog may send 2–4 short bubbles in one model call. */
export const BUBBLE_MARKER = '⟦NW_B⟧';
export const MAX_BUBBLES = 4;
const BUBBLE_RE = /⟦NW_B⟧/g;
/** A marker cut mid-stream ("⟦NW_R", "⟦NW_RQ:2", "⟦NW_B") at the very end of the text so far. */
const PARTIAL_TAIL_RE = /⟦(?:N(?:W(?:_(?:R(?:Q(?::\d{0,2})?)?|B)?)?)?)?$/;

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
  return text.replace(/\s*⟦NW_B⟧\s*/g, '\n\n').replace(MARKER_ALL_RE, '').replace(PARTIAL_TAIL_RE, '').replace(/^\s+/, '');
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

export type AssistantBubble = { raw: string; quoteN: number | null };

/**
 * Splits one model output into ordered bubbles (server and client use the same parser).
 * Empty segments are dropped; overflow beyond MAX_BUBBLES is merged into the last bubble;
 * each bubble keeps only its own quote marker. Quotes are policy-checked against turns and
 * de-duplicated (two bubbles never quote the same message). A trailing empty segment while
 * streaming means "Almog is typing the next bubble" (see hasPendingBubble).
 */
export function splitAssistantBubbles(text: string | null | undefined, turns?: QuoteTurn[]): AssistantBubble[] {
  const src = String(text ?? '').replace(PARTIAL_TAIL_RE, '');
  const segs = src.split(BUBBLE_RE).map((x) => x.trim()).filter((x) => stripReplyQuoteMarker(x).trim().length > 0);
  if (segs.length > MAX_BUBBLES) {
    const head = segs.slice(0, MAX_BUBBLES - 1);
    const tail = segs.slice(MAX_BUBBLES - 1).map((x) => stripReplyQuoteMarker(x).trim()).join('\n\n');
    const firstN = extractReplyQuoteIndex(segs[MAX_BUBBLES - 1]);
    segs.splice(0, segs.length, ...head, firstN ? `⟦NW_RQ:${firstN}⟧${tail}` : tail);
  }
  const used = new Set<number>();
  return segs.map((seg) => {
    let n = extractReplyQuoteIndex(seg);
    if (n != null && turns && !isReplyQuoteAllowed(turns, n)) n = null;
    if (n != null && used.has(n)) n = null;
    if (n != null) used.add(n);
    return { raw: stripReplyQuoteMarker(seg).trim(), quoteN: n };
  });
}

/** True while streaming when the text ends right after a bubble marker (next bubble not started). */
export function hasPendingBubble(text: string | null | undefined): boolean {
  const s = String(text ?? '').replace(PARTIAL_TAIL_RE, '').trimEnd();
  return s.endsWith(BUBBLE_MARKER) || /⟦NW_B⟧\s*(?:⟦NW_RQ:\d{1,2}⟧)?\s*$/.test(s);
}

/** Prompt block for multi-bubble replies (always short; the model decides, server enforces caps). */
export function buildBubblePromptBlock(): string {
  return [
    '— כמה בועות (כמו בוואטסאפ) —',
    'כשיש לך כמה נקודות נפרדות באמת (למשל המשתמש שלח כמה הודעות או שאל כמה דברים), אפשר לפצל את התשובה ל-2 עד 4 בועות קצרות, כמו בן אדם שמקליד.',
    'ברוב התשובות בועה אחת מספיקה. לא מפצלים תשובה אחת רציפה, ולא מפצלים סתם.',
    `איך: בין בועה לבועה כותבים ${BUBBLE_MARKER}. כל בועה יכולה להתחיל בציטוט משלה ⟦NW_RQ:n⟧ של ההודעה שהיא עונה עליה, לפי אותם כללי ציטוט.`,
    `דוגמה: ⟦NW_RQ:2⟧על הפיצה, זה בסדר גמור, לא צריך לפצות.${BUBBLE_MARKER}⟦NW_RQ:1⟧ולגבי המים, בערך 8 כוסות ביום.`,
  ].join('\n');
}

/** Short Hebrew note telling the writer which of its own messages the user replied to. */
export function buildUserQuotedNote(quotedAssistantText: string | null | undefined): string | null {
  const t = String(quotedAssistantText ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  return `— המשתמש הגיב בציטוט להודעה שלך: "${t.length > 120 ? `${t.slice(0, 120)}…` : t}". ההודעה האחרונה שלו מתייחסת אליה.`;
}
