/**
 * מיפוי שורות שמכילות את המילה pending בקובץ הסיווג.
 * 1 נשארה בסיווג pending (not encrypted yet) אחרי PK nonempty proof + triage. שמונה האחרות אינן עמודות גלויות.
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
  {
    table: 'billing_invoices',
    column: 'doc_url',
    sensitivity: 'כתובת מסמך; עלולה לשאת אסימון אם ספק ממלא אותה',
    verdict: 'לא_אומת',
    write: 'אין כתיבה בקוד או במיגרציה מלבד הגדרת העמודה ב-000188',
    read: 'אין קריאה בקוד האפליקציה. יש RLS לבחירה של בעל החשבון',
    next: 'לא מצפינים עמודה בלי כותב. כשסנכרון הספק יגיע: לבדוק אם ה-URL נושא אסימון גישה; אם כן — לחתום / להפריד טוקן, לא לסווג כלא-רגיש רק כי השם doc_url.',
  },
];

export const NEXT_ENCRYPTION_STEP =
  'PK nonempty legacy upgrade proved on isolated DB (255–257 + backfill). Triage: error_events.message already registered/sealed; ip_block_ranges.reason fixed-code; ops_probe_daily.country ISO-2 aggregate (no crypto). Remaining classification-pending: billing_invoices.doc_url only (1) — hold for billing writer (URL may carry tokens). Legacy append-only separate gate; production approval still required. Not a full-PII finish.';
