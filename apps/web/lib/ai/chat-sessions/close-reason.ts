export const CHAT_CLOSE_REASONS = ['user', 'almog_ended', 'auto_idle', 'auto_abandoned', 'admin'] as const;
export type ChatCloseReason = (typeof CHAT_CLOSE_REASONS)[number];

export function normalizeCloseReason(v: unknown): ChatCloseReason | null {
  return typeof v === 'string' && (CHAT_CLOSE_REASONS as readonly string[]).includes(v) ? (v as ChatCloseReason) : null;
}

/** Hebrew label for the closed-chat banner and history row. */
export function closeReasonLabel(reason: ChatCloseReason | null | undefined, idleHours = 1): string {
  switch (reason) {
    case 'user':
      return 'סגרת את השיחה';
    case 'almog_ended':
      return 'אלמוג סגר כי נראה שהשיחה הסתיימה';
    case 'auto_idle':
      return idleHours === 1 ? 'נסגרה אוטומטית אחרי שעה בלי פעילות' : `נסגרה אוטומטית אחרי ${idleHours} שעות בלי פעילות`;
    case 'auto_abandoned':
      return 'נסגרה אוטומטית כי השיחה נקטעה';
    case 'admin':
      return 'נסגרה על ידי הצוות';
    default:
      return 'השיחה נסגרה';
  }
}

/** Short words that end a conversation ("thanks", "good night", "bye"...). */
const FAREWELL_RE =
  /^(?:תודה(?: רבה| ענקית)?|תודה אלמוג|תנקס|סבבה(?: תודה)?|אחלה(?: תודה)?|מעולה(?: תודה)?|יאללה(?: ביי| לילה טוב)?|ביי|באי|להתראות|לילה טוב|לילה|שבוע טוב|שבת שלום|נדבר(?: מחר| אחר כך)?|נתראה|טוב תודה|אוקיי תודה|אוקי תודה|👍|🙏|❤️)[\s!.,🙏❤️👍😊🙂]*$/u;

export function isFarewellMessage(text: string | null | undefined): boolean {
  const t = (text ?? '').trim();
  return t.length > 0 && t.length <= 40 && FAREWELL_RE.test(t);
}

/** A conversation that ended with a goodbye closes sooner than a plain idle one. */
export const FAREWELL_CLOSE_MS = 15 * 60 * 1000;
