/** האם גוף ההתראה מסתיים בשאלה פתוחה (עברית/לטינית). */
export function notificationBodyHasQuestion(body: string): boolean {
  const t = body.trim();
  if (!t) return false;
  if (/[?؟]\s*$/.test(t)) return true;
  const sentences = t.split(/(?<=[.!?؟])\s+/);
  const last = (sentences[sentences.length - 1] ?? t).trim();
  return /^(מה|איך|למה|מדוע|האם|איפה|מתי|מי|כמה)\b/u.test(last);
}

export type ReplyableNotificationFields = {
  type: string;
  body: string;
  mentorId: 'almog' | 'dolev';
  expectsReply?: boolean;
};

/** רק הודעות מאלמוג עם שאלה — ניתן להגיב דרך הצ'אט. */
export function isNotificationReplyable(n: ReplyableNotificationFields): boolean {
  if (n.type !== 'ai_message') return false;
  if (n.mentorId !== 'almog') return false;
  if (n.expectsReply === false) return false;
  if (n.expectsReply === true) return true;
  return notificationBodyHasQuestion(n.body);
}

export function extractSource(meta: unknown): string | null {
  if (!meta || typeof meta !== 'object') return null;
  const s = (meta as { source?: unknown }).source;
  return typeof s === 'string' && s.length > 0 ? s : null;
}

export function extractExpectsReply(meta: unknown): boolean | undefined {
  if (!meta || typeof meta !== 'object') return undefined;
  const er = (meta as { expects_reply?: unknown }).expects_reply;
  if (er === true) return true;
  if (er === false) return false;
  return undefined;
}
