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
    table: 'access_audit_findings',
    column: 'signals',
    sensitivity: 'קודי אות קצרים, לא טקסט אישי חופשי',
    verdict: 'פער_תוכן',
    write: 'audit-job.ts מכניס את מערך האותות ב-insert גלוי',
    read: 'AccessAuditFindings.tsx בוחר signals לתצוגה',
    next: 'הניסוח "מחוץ לענף" ישן: 000200 כבר בקוד. לא מצפינים לבד; אחרי summary, במפתח מערכת audit, בלי אינדקס.',
  },
  {
    table: 'access_audit_findings',
    column: 'summary',
    sensitivity: 'טקסט חופשי של ממצא ביקורת',
    verdict: 'פער_תוכן',
    write: 'audit-job.ts כותב summary מהמודל או מאותות, עד 400 תווים',
    read: 'AccessAuditFindings.tsx בוחר summary',
    next: 'אחרי pii_access_grants.reason: חתימה במפתח מערכת audit ופענוח בקורא. GATED_AFTER_IAM_MERGE לא נקרא על ידי החותם.',
  },
  {
    table: 'access_audit_runs',
    column: 'error',
    sensitivity: 'הודעת כשל תפעולית קצרה',
    verdict: 'פער_תוכן',
    write: 'audit-job.ts מעדכן error אחרי כשל מודל, חתוך ל-120 תווים',
    read: 'העמודה לא נבחרת במסך הממצאים; נשמרת על שורת הריצה',
    next: 'אותו מפתח מערכת audit כמו summary. אין פרדיקט SQL על העמודה.',
  },
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
    verdict: 'סיווג_ישן',
    write: 'report-error.ts שולח דרך fetch שחותם לפי field-registry',
    read: 'logging/load.ts ו-ceo/tools.ts בוחרים message; 000218 כבר לא מקבץ לפי הטקסט',
    next: 'ההערה על 000109 ישנה. העמודה רשומה וחתומה. לא פותחים אותה מחדש ולא מוסיפים אינדקס.',
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
    table: 'ops_device_enrollments',
    column: 'label',
    sensitivity: 'תווית מכשיר',
    verdict: 'פער_תוכן',
    write: 'enrollment.ts מעדכן label עד 80 תווים אחרי פתיחת הקישור',
    read: 'loadByCookie קורא select *',
    next: 'הניסוח "מחוץ לענף" ישן: 000198 והכותב בקוד. חותמים במפתח מערכת ops אחרי reason, ומפענחים בקורא. token_hash נשאר גיבוב.',
  },
  {
    table: 'ops_device_enrollments',
    column: 'location',
    sensitivity: 'מיקום גס של מכשיר',
    verdict: 'פער_תוכן',
    write: 'enrollment.ts מעדכן location עד 80 תווים באותה כתיבה',
    read: 'loadByCookie קורא את השורה המלאה',
    next: 'יחד עם label, לא כמפתח חיפוש. החיפוש הוא לפי id וגיבוב.',
  },
  {
    table: 'ops_probe_daily',
    column: 'country',
    sensitivity: 'קוד מדינה בן שתי אותיות',
    verdict: 'כותב_SQL',
    write: 'פונקציית 000198 עושה upsert; המפתח הוא day+ip_hash',
    read: 'audit-job.ts בוחר country למונה, בלי סינון SQL על המדינה',
    next: 'לא מצפינים כל עוד ה-SQL כותב בלי מפתח. הדגל היה שומט את מונה הבדיקות. להעביר את הכתיבה לאפליקציה לפני חתימה.',
  },
  {
    table: 'pii_access_grants',
    column: 'country',
    sensitivity: 'קוד מדינה',
    verdict: 'פער_תוכן',
    write: 'pii-access.ts כותב country מתוך בקשת הגישה',
    read: 'audit-job.ts טוען country לזיכרון ומשווה מדינות מוכרות',
    next: 'לא השלב הראשון. חתימה אפשרית רק אחרי שההשוואה מפענחת. אין where על country.',
  },
  {
    table: 'pii_access_grants',
    column: 'reason',
    sensitivity: 'נימוק גישה חופשי',
    verdict: 'פער_תוכן',
    write: 'createPiiGrant מכניס reason אחרי validateJustification',
    read: 'liveGrant קורא את השורה ומעביר reason לאובייקט ההרשאה',
    next: 'זה השלב הבא: חתימת מפתח מערכת audit, פענוח לפני liveGrant, בלי לשנות subject_id או את חלון התוקף.',
  },
  {
    table: 'pii_access_grants',
    column: 'ticket_ref',
    sensitivity: 'מזהה פנייה קצר',
    verdict: 'פער_תוכן',
    write: 'createPiiGrant כותב ticket_ref עם הנימוק',
    read: 'נבחר עם השורה ומועבר ל-grant; אין eq על העמודה',
    next: 'חותמים יחד עם reason, לא כמפתח חיפוש נפרד.',
  },
  {
    table: 'pii_access_log',
    column: 'country',
    sensitivity: 'קוד מדינה ביומן גישה',
    verdict: 'פער_תוכן',
    write: 'pii-access.ts כותב country בשורות view, denied, grant, revoke',
    read: 'audit-job.ts בוחר country לחלון ולחודש אחורה',
    next: 'אחרי reason. היומן append-only בפועל לפי בדיקת ה-SQL; חתימה לא משנה את event.',
  },
  {
    table: 'pii_access_log',
    column: 'resource',
    sensitivity: 'שם משאב או הליטרל grant, עד 80 תווים',
    verdict: 'פער_תוכן',
    write: 'pii-access.ts כותב resource.slice(0, 80)',
    read: 'נשמר ביומן; אין סינון SQL על העמודה בקוד שנבדק',
    next: 'יחד עם country של היומן. לא מפתח שורה.',
  },
];

export const NEXT_ENCRYPTION_STEP =
  'השלב הבא הוא רק pii_access_grants.reason: חתימת enc:v2 במפתח מערכת audit, פענוח לפני הקריאה, על נתוני דמה, בלי להפעיל דחיית טקסט גלוי על טבלה ש-SQL כותב אליה ובלי להצפין מזהי שוויון.';
