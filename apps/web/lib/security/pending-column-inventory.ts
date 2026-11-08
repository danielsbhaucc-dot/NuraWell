/**
 * מיפוי 27 שורות שמכילות את המילה pending בקובץ הסיווג.
 * 19 מהן הן הסטטוס "pending (not encrypted yet)". שמונה האחרות אינן עמודות גלויות.
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
    table: 'admin_passkeys',
    column: 'telegram_user_id',
    sensitivity: 'מזהה חשבון טלגרם',
    verdict: 'מפתח_שאילתה',
    write: 'ceo/security.ts כותב telegram_user_id ביצירת מפתח',
    read: 'אותו קובץ משווה בשוויון: eq credential ואז telegram_user_id !== tgUser',
    next: 'לא מצפינים לפני עמודת אינדקס עיוור. הצפנה עכשיו שוברת את שיוך המכשיר.',
  },
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
    table: 'gideon_device_requests',
    column: 'chat_id',
    sensitivity: 'מזהה שיחת טלגרם',
    verdict: 'מפתח_שאילתה',
    write: 'ceo/security.ts מכניס chat_id',
    read: 'שוויון eq chat_id לחיפוש בקשה פתוחה, ובחירה לפי status',
    next: 'לא מצפינים לפני עמודת אינדקס עיוור. זה מזהה שורה, לא תוכן.',
  },
  {
    table: 'gideon_stranger_sim',
    column: 'attempts',
    sensitivity: 'מונה מסוג ניסיון וזמן, לא טקסט ההודעה',
    verdict: 'צמוד_למפתח',
    write: 'stranger-sim.ts מעדכן attempts כמערך {at, kind}',
    read: 'אותו קובץ קורא attempts לפי chat_id',
    next: 'לא מצפינים לבד. אם מחליפים את מפתח chat_id לאינדקס עיוור, חותמים את המונה באותו שינוי.',
  },
  {
    table: 'gideon_stranger_sim',
    column: 'chat_id',
    sensitivity: 'מזהה שיחה ומפתח ראשי',
    verdict: 'מפתח_שאילתה',
    write: 'stranger-sim.ts upsert לפי chat_id',
    read: 'eq chat_id וגם מחיקה לפי אותו מפתח',
    next: 'לא מצפינים לפני עמודת אינדקס עיוור. המפתח הראשי חייב להישאר ניתן לשוויון.',
  },
  {
    table: 'gideon_telegram_identities',
    column: 'from_id',
    sensitivity: 'מזהה שולח ומפתח שורה',
    verdict: 'מפתח_שאילתה',
    write: 'השורה נוצרת סביב from_id; reason שלצידו כבר רשום',
    read: 'GideonTelegramIdentities.tsx בוחר from_id ומפעיל allow/block לפיו',
    next: 'לא מצפינים לפני עמודת אינדקס עיוור. reason כבר במסלול ההצפנה ואינו חלק מהפער הזה.',
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
  {
    table: 'parent_signup_claims',
    column: 'email',
    sensitivity: 'כתובת אימייל של ההורה בטענת הרשמה',
    verdict: 'מפתח_שאילתה',
    write: 'parent_signup_begin (SQL security definer) מכניס email; רק service_role',
    read: 'השוואת שוויון SQL ב-begin מול p_email; אין בחירה באפליקציה לתצוגה',
    next: 'לא מצפינים לפני העברת ההשוואה לאפליקציה או אינדקס עיוור. nonce נשאר מפתח ראשי.',
  },
];

export const NEXT_ENCRYPTION_STEP =
  'פערי התוכן הסגורים (grants/log/findings/enroll/runs). נשארו מפתחות שאילתה בלי אינדקס עיוור + doc_url בלי כותב. השער הבא: UI-release automated checks + exact GUI URLs.';
