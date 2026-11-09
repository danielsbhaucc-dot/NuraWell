/**
 * מיפוי שורות שמכילות את המילה pending בקובץ הסיווג.
 * 0 עמודות בסיווג pending (not encrypted yet) אחרי billing_invoices.doc_url register. שמונה האחרות אינן עמודות גלויות.
 * זה חשד שמוין מול כתיבה וקריאה בקוד, לא אבחנת דליפה ולא רשימת הצפנה.
 * אין כאן נתוני אמת. אין שינוי סכמה.
 */
export type PendingVerdict = 'סיווג_ישן' | 'מפתח_שאילתה' | 'צמוד_למפתח' | 'כותב_SQL' | 'פער_תוכן' | 'לא_אומת' | 'קוד_קבוע';

export type PendingFinding = {
  table: string;
  column: string;
  sensitivity: string;
  verdict: PendingVerdict;
  write: string;
  read: string;
  next: string;
};

export const PENDING_WORD_NOT_A_PLAINTEXT_COLUMN = [
  'הערת הכותרת של column-classification.ts',
  'sos outcome: קוד סטטוס non_sensitive',
  'ceo_pending_actions: שם טבלה',
  'pending_questions: תוכן צוות, non_sensitive',
  'ops_login_requests.pending_hash: גיבוב, non_sensitive',
  'pending_almog_commitment_jobs: שם טבלה',
  'pending_chat_logs: שם טבלה',
  'pending_ai_proposal: sensitive וכבר registered',
] as const;

export const PENDING_COLUMN_INVENTORY: readonly PendingFinding[] = [
  // none — last sensitive pending (billing_invoices.doc_url) registered for seal-on-write
];

export const NEXT_ENCRYPTION_STEP =
  'billing_invoices.doc_url registered (per-user seal-on-write; no billing writer invented). Classification-pending sensitive columns: 0. Legacy append-only evidence tables remain a separate release gate (immutability kept; no history rewrite). Production approval / hosted enforce still required. Not a full-PII finish.';
