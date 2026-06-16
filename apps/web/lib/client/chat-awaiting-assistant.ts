export const PENDING_CHAT_REPLY_KEY = 'nurawell_almog_pending_reply';

export type PendingChatReply = {
  sessionId: string;
  startedAt: string;
};

export function isAwaitingAssistantResponse(
  turns: Array<{ role: string }>
): boolean {
  if (!turns.length) return false;
  return turns[turns.length - 1]?.role === 'user';
}

export function readPendingChatReply(): PendingChatReply | null {
  try {
    const raw = sessionStorage.getItem(PENDING_CHAT_REPLY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingChatReply;
    if (!parsed?.sessionId || !parsed?.startedAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writePendingChatReply(sessionId: string): void {
  try {
    const payload: PendingChatReply = {
      sessionId,
      startedAt: new Date().toISOString(),
    };
    sessionStorage.setItem(PENDING_CHAT_REPLY_KEY, JSON.stringify(payload));
  } catch {
    /* */
  }
}

export function clearPendingChatReply(): void {
  try {
    sessionStorage.removeItem(PENDING_CHAT_REPLY_KEY);
  } catch {
    /* */
  }
}

/** מקסימום זמן המתנה לפני ניסיון המשך יצירת תשובה */
export const AWAITING_ASSISTANT_RESUME_MS = 90_000;

/** תדירות סקר לתשובה שנשמרה בשרת */
export const AWAITING_ASSISTANT_POLL_MS = 2_500;
