/**
 * מיפוי שורות שמכילות את המילה pending בקובץ הסיווג.
 * 4 נשארו בסיווג pending (not encrypted yet) אחרי PK telegram. שמונה האחרות אינן עמודות גלויות.
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
    next: 'לא מצפינים עמודה בלי כותב. כשסנכרון הספק יגיע, חותמים את הכתובת ומשאירים doc_number גלוי.',
  },
  {
    table: 'error_events',
    column: 'message',
    sensitivity: 'טקסט שגיאה תפעולי',
    verdict: 'מפתח_שאילתה',
    write: 'report-error.ts שולח דרך fetch שחותם לפי field-registry (stack/tags רשומים; message עדיין מפתח קיבוץ ישן)',
    read: 'logging/load.ts ו-ceo/tools.ts בוחרים message; 000109 מקבץ לפי הטקסט',
    next: 'לא מצפינים לפני עמודת fingerprint/אינדקס עיוור. stack ו-tags כבר רשומים.',
  },
  {
    table: 'ip_block_ranges',
    column: 'reason',
    sensitivity: 'קוד קצר, עד 80 תווים',
    verdict: 'קוד_קבוע',
    write: 'security-core/ir.ts כותב את הליטרל manual',
    read: 'אותו קובץ בוחר reason לרשימת חסימות פעילות',
    next: 'אין טקסט אישי בקוד הנוכחי. אם ייכנס טקסט חופשי, חותמים כמו note של ip_blocks. לא חוסמים את cidr.',
  },
  {
    table: 'ops_probe_daily',
    column: 'country',
    sensitivity: 'קוד מדינה בן שתי אותיות',
    verdict: 'כותב_SQL',
    write: 'פונקציית 000198 עושה upsert; המפתח הוא day+ip_hash',
    read: 'audit-job.ts בוחר country למונה, בלי סינון SQL על המדינה',
    next: 'לא מצפינים כל עוד ה-SQL כותב בלי מפתח. להעביר את הכתיבה לאפליקציה לפני חתימה.',
  },
];

export const NEXT_ENCRYPTION_STEP =
  'PK telegram query-keys sealed locally (gideon_stranger_sim.chat_id + gideon_telegram_identities.from_id, UUID surrogate + bidx, 000255–000257). Remaining classification-pending: billing_invoices.doc_url, error_events.message, ip_block_ranges.reason, ops_probe_daily.country (4). Legacy append-only + held pending review; production approval still required. Not a full-PII finish.';
