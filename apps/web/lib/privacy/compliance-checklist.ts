/**
 * Owner privacy-compliance checklist (Ops → פרטיות). Pure definitions + status logic (tested).
 * Vendor names are fine here: the page and API are admin-only.
 */
export type ComplianceLink = { label: string; href: string };
export type ComplianceSub = { key: string; label: string; href?: string };
export type ComplianceAuto = 'thresholds' | 'access_log' | 'backup_drill';
export type ComplianceItem = {
  key: string;
  group: 'owner' | 'high';
  title: string;
  why: string;
  how: string[];
  links?: ComplianceLink[];
  subs?: ComplianceSub[];
  /** Must be re-confirmed every calendar year, by 31 Dec. */
  yearly?: boolean;
  /** Re-do interval in months (external tests). */
  everyMonths?: number;
  /** Periodic re-review interval in months for items that are not yearly/everyMonths (reopens automatically). */
  reviewMonths?: number;
  auto?: ComplianceAuto;
  ack?: string;
};
export type ComplianceRow = { item_key: string; done: boolean; done_at: string | null; updated_at: string; meta?: Record<string, unknown> | null };
export type ItemState = 'done' | 'open' | 'overdue' | 'partial';

const doc = (slug: string, label: string): ComplianceLink => ({ label, href: `/api/v1/admin/privacy-compliance/docs/${slug}` });

/** From compliance doc 06 (vendors outside the EU that receive personal data). */
export const DPA_VENDORS: ComplianceSub[] = [
  { key: 'vercel', label: 'Vercel (אירוח האתר)', href: 'https://vercel.com/legal/dpa' },
  { key: 'openrouter', label: 'OpenRouter (בינה מלאכותית) + הגדרת אי־שמירת נתונים', href: 'https://openrouter.ai/privacy' },
  { key: 'upstash', label: 'Upstash (תורים וזיכרון)', href: 'https://upstash.com/trust/dpa.pdf' },
  { key: 'resend', label: 'Resend (משלוח מיילים)', href: 'https://resend.com/legal/dpa' },
  { key: 'cloudflare', label: 'Cloudflare (DNS והגנה)', href: 'https://www.cloudflare.com/cloudflare-customer-dpa/' },
  { key: 'uploadthing', label: 'UploadThing (קבצים, לבקש DPA מהתמיכה)' },
];
export const MFA_VENDORS: ComplianceSub[] = [
  { key: 'supabase', label: 'Supabase' }, { key: 'vercel', label: 'Vercel' }, { key: 'github', label: 'GitHub' },
  { key: 'openrouter', label: 'OpenRouter' }, { key: 'upstash', label: 'Upstash' }, { key: 'resend', label: 'Resend' },
  { key: 'bunny', label: 'Bunny' }, { key: 'cloudflare', label: 'Cloudflare' }, { key: 'uploadthing', label: 'UploadThing' },
  { key: 'email', label: 'תיבת המייל של העסק' },
];

export const COMPLIANCE_ITEMS: ComplianceItem[] = [
  { key: 'business_details', group: 'owner', reviewMonths: 12, title: 'מילוי פרטי העסק במסמכים',
    why: 'החוק דורש לדעת מי בעל המאגר ומי אחראי עליו. בלי שם, מספר עוסק וכתובת, המסמכים לא שווים כלום מול הרשות.',
    how: ['פותחים כל מסמך (01–09) בגרסת Word.', 'ממלאים את כל מה שמסומן בצהוב: שם משפטי, ח.פ. או ע.מ., כתובת ופרטי קשר.', 'שומרים עותק חתום אצלך.'],
    links: [doc('01-database-definitions.docx', 'מסמך 01 (Word)')] },
  { key: 'db_definitions_policy', group: 'owner', yearly: true, title: 'אישור מסמך הגדרות מאגר ונוהל אבטחה',
    why: 'החתימה היא ההוכחה שבעל המאגר קרא ואישר. התקנות מחייבות לעדכן ולאשר מחדש פעם בשנה, ולכן הסעיף נפתח מחדש כל ינואר.',
    how: ['קוראים את מסמך 01 ואת נוהל האבטחה (02).', 'מתקנים מה שלא נכון, חותמים ושומרים.', 'מסמנים כאן. עד 31 בדצמבר של כל שנה צריך לעבור שוב ולאשר.'],
    links: [doc('01-database-definitions.pdf', 'מסמך 01'), doc('02-security-procedure.pdf', 'מסמך 02')] },
  { key: 'dpa', group: 'owner', reviewMonths: 12, title: 'הסכמי עיבוד מידע עם ספקים מחוץ לאיחוד האירופי',
    why: 'כשמידע עובר לספק בחו"ל, צריך התחייבות כתובה שהוא שומר עליו, לפי תקנות ההעברה ותקנה 15. בלי הסכם, ההעברה עצמה עלולה להיות הפרה.',
    how: ['לכל ספק: נכנסים לקישור, מורידים או מאשרים את הסכם ה־DPA (בדרך כלל בלחיצה בהגדרות החשבון).', 'שומרים את הקובץ בתיקייה אחת.', 'מסמנים את הספק כאן.'],
    subs: DPA_VENDORS, links: [doc('06-subprocessors.pdf', 'מסמך 06 (חסוי)')] },
  { key: 'mfa', group: 'owner', reviewMonths: 6, title: 'אימות דו־שלבי בכל חשבונות הספקים',
    why: 'רוב הפריצות מתחילות בסיסמה שדלפה. אימות דו־שלבי חוסם את זה, והוא חלק מבקרת הגישה שהתקנות דורשות.',
    how: ['נכנסים להגדרות האבטחה בכל חשבון.', 'מפעילים אפליקציית אימות או מפתח אבטחה (לא SMS אם אפשר).', 'שומרים את קודי הגיבוי במנהל סיסמאות ומסמנים כאן.'],
    subs: MFA_VENDORS },
  { key: 'lawyer_review', group: 'owner', reviewMonths: 24, title: 'בדיקת עורך דין לפרטיות',
    why: 'המסמכים הם טיוטה טכנית. רק עורך דין יכול לאשר שהם מספיקים מבחינה משפטית, וזה מה שמגן עליך אם תהיה תלונה.',
    how: ['שולחים לעורך דין שמתמחה בהגנת הפרטיות את המסמכים 01–09 ואת מדיניות הפרטיות ותנאי השימוש.', 'מתקנים לפי ההערות ושומרים את חוות הדעת.'] },
  { key: 'dpo_decision', group: 'owner', reviewMonths: 12, title: 'החלטה על ממונה פרטיות',
    why: 'כרגע לא חובה, אבל מינוי מוקדם מקטין קנסות. ההחלטה עצמה צריכה להיות מתועדת.',
    how: ['קוראים את מסמך 07.', 'מחליטים: למנות עכשיו (שירות חיצוני) או לבדוק שוב ב־1,000 משתמשים.', 'רושמים את ההחלטה ומסמנים.'],
    links: [doc('07-dpo-recommendation.pdf', 'מסמך 07')] },
  { key: 'thresholds', group: 'owner', auto: 'thresholds', title: 'מעקב ספים',
    why: 'כשמספר המשתמשים עובר סף, חובות חדשות נכנסות לתוקף. המספר כאן חי ומתעדכן מהמאגר.',
    how: ['ב־1,000 משתמשים: לבדוק שוב את נושא ממונה הפרטיות.', 'ב־100,000 משתמשים: חובת הודעה לרשות להגנת הפרטיות, ומעבר לרמת אבטחה גבוהה.'] },

  { key: 'pentest', group: 'high', everyMonths: 18, title: 'סקר סיכונים ומבדק חדירה חיצוני',
    why: 'ברמה הגבוהה התקנות מחייבות סקר סיכונים ומבדק חדירה על ידי גורם חיצוני לפחות פעם ב־18 חודשים.',
    how: ['פונים לחברת אבטחת מידע ישראלית שמבצעת מבדקי חדירה לאפליקציות ווב (יש הרבה, מבוטיקים קטנים ועד חברות ייעוץ גדולות). מבקשים הצעה ל"סקר סיכונים ומבדק חדירה לפי תקנות הגנת הפרטיות (אבטחת מידע)".', 'מבקשים שיכלול: האתר, ה־API, פאנל הניהול, ההרשאות במסד הנתונים והאימות.', 'עלות טיפוסית: כמה אלפי שקלים, לפי ההיקף.', 'שומרים את הדוח הסופי ואת אישור תיקון הממצאים. מסמנים כאן עם תאריך.'],
    links: [doc('05-risk-assessment.pdf', 'סקר הסיכונים הפנימי (05)')] },
  { key: 'external_audit', group: 'high', everyMonths: 24, title: 'ביקורת אבטחה חיצונית',
    why: 'ברמה הגבוהה נדרשת ביקורת חיצונית על עמידה בתקנות לפחות פעם ב־24 חודשים.',
    how: ['מזמינים מבודק חיצוני (לא מי שבנה את המערכת) ביקורת עמידה בתקנות אבטחת המידע.', 'הוא בודק את המסמכים מול מה שקורה בפועל.', 'שומרים את דוח הביקורת ואת תוכנית התיקונים.'] },
  { key: 'security_policy_yearly', group: 'high', yearly: true, title: 'עדכון שנתי של נוהל האבטחה',
    why: 'נוהל שלא מתעדכן לא משקף את המערכת. התקנות דורשות לעדכן אותו לפחות פעם בשנה.',
    how: ['עוברים על מסמך 02 ומעדכנים שינויים מהשנה (ספקים, הרשאות, תהליכים).', 'חותמים ומסמנים כאן. מועד אחרון: 31 בדצמבר.'],
    links: [doc('02-security-procedure.pdf', 'מסמך 02')] },
  { key: 'access_log', group: 'high', auto: 'access_log', title: 'תיעוד כל גישה למידע',
    why: 'התקנות דורשות יומן אוטומטי של כל גישה למערכות. זה כבר פעיל: כל פעולה בפאנל הניהול נרשמת.',
    how: ['אין מה לעשות. אפשר לצפות ביומן בכל רגע.'],
    links: [{ label: 'יומן הפעולות', href: '/ops/ceo/insights' }] },
  { key: 'backup_drill', group: 'high', auto: 'backup_drill', title: 'גיבויים מתועדים ובדיקת שחזור',
    why: 'גיבוי שלא בדקו אם אפשר לשחזר ממנו לא שווה הרבה. נדרש תיעוד ובדיקה תקופתית.',
    how: ['תרגול שחזור רץ אוטומטית פעם בחודש (עם הדוח החודשי של גדעון) ונרשם כאן.', 'בתוכנית החינמית של Supabase אין גיבוי יומי ואין שחזור לנקודת זמן. לפני ההשקה מומלץ לשדרג לתוכנית Pro.', 'לשמור עותק לא מקוון של מפתח ההצפנה במנהל סיסמאות.'],
    links: [doc('08-backup-restore.pdf', 'נוהל גיבוי ושחזור (08)')] },
  { key: 'training', group: 'high', title: 'הדרכה בכתב לכל מורשה גישה',
    why: 'כל מי שמקבל גישה צריך לקבל הדרכה כתובה ולחתום עליה, לפני הגישה ופעם בשנה.',
    how: ['כל מורשה (כרגע רק אתה) קורא את מסמך 09 וחותם.', 'כשמצטרף מישהו חדש: חתימה לפני מתן גישה.'],
    links: [doc('09-security-training.pdf', 'מסמך 09')], yearly: true, ack: 'קראתי את ההדרכה ואני מתחייב לפעול לפיה' },
];

export const COMPLIANCE_DOCS: { slug: string; title: string; sensitive?: boolean }[] = [
  { slug: '01-database-definitions', title: 'הגדרות מאגר' },
  { slug: '02-security-procedure', title: 'נוהל אבטחת מידע' },
  { slug: '03-authorized-persons', title: 'רשימת מורשי גישה' },
  { slug: '04-incident-response', title: 'נוהל אירוע אבטחה' },
  { slug: '05-risk-assessment', title: 'סקר סיכונים' },
  { slug: '06-subprocessors', title: 'רשימת ספקים (חסוי)', sensitive: true },
  { slug: '07-dpo-recommendation', title: 'המלצה לגבי ממונה פרטיות' },
  { slug: '08-backup-restore', title: 'נוהל גיבוי ושחזור' },
  { slug: '09-security-training', title: 'הדרכת אבטחת מידע למורשי גישה' },
];
export const DOC_SLUG_RE = /^(0[1-9])-[a-z-]+\.(pdf|docx)$/;
export const isKnownDocFile = (f: string) => DOC_SLUG_RE.test(f) && COMPLIANCE_DOCS.some((d) => f === `${d.slug}.pdf` || f === `${d.slug}.docx`);

export const THRESHOLDS = { dpo: 1000, ppaNotice: 100000 } as const;
export const DRILL_MAX_AGE_DAYS = 35;

export function allItemKeys(): string[] {
  return COMPLIANCE_ITEMS.flatMap((i) => (i.subs ? i.subs.map((s) => `${i.key}:${s.key}`) : i.auto ? [] : [i.key]));
}

const ilYear = (d: Date) => Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric' }).format(d));

const DAY = 86_400_000;
/** Reopen this many days before a month-based due date, so there is time to act. */
export const REOPEN_LEAD_DAYS = 30;

const addMonths = (d: Date, m: number) => { const x = new Date(d); x.setUTCMonth(x.getUTCMonth() + m); return x; };
/** 31 Dec 23:59:59 Asia/Jerusalem (UTC+2 in winter). */
const ilYearEnd = (y: number) => new Date(Date.UTC(y, 11, 31, 21, 59, 59));
const ilYearStart = (y: number) => new Date(Date.UTC(y - 1, 11, 31, 22, 0, 0));

export type RowSchedule = { nextDue: Date; reopenAt: Date } | null;

/**
 * When a completed row must be redone. null = one-off (never expires).
 * yearly: valid for the calendar year it was done in, reopens 1 Jan, due 31 Dec of the next year.
 * everyMonths / reviewMonths: due done_at + N months, reopens REOPEN_LEAD_DAYS before.
 */
export function rowSchedule(item: ComplianceItem, doneAt: Date): RowSchedule {
  if (item.yearly) { const y = ilYear(doneAt) + 1; return { nextDue: ilYearEnd(y), reopenAt: ilYearStart(y) }; }
  const months = item.everyMonths ?? item.reviewMonths;
  if (!months) return null;
  const nextDue = addMonths(doneAt, months);
  return { nextDue, reopenAt: new Date(nextDue.getTime() - REOPEN_LEAD_DAYS * DAY) };
}

const validAt = (row: ComplianceRow | undefined) => {
  if (!row?.done || !row.done_at) return null;
  const at = new Date(row.done_at);
  return Number.isFinite(at.getTime()) ? at : null; // fail-safe: unparsable date = not done
};

/** Status of one toggle row: done until its reopen moment, then needs work again. */
export function rowDone(item: ComplianceItem, row: ComplianceRow | undefined, now = new Date()): boolean {
  const at = validAt(row);
  if (!at || at.getTime() > now.getTime() + DAY) return false; // future-dated = suspicious → open
  const sch = rowSchedule(item, at);
  return !sch || now < sch.reopenAt;
}

/** 'done' | 'open' (reopened, still before due) | 'overdue' (past due) for a single row. */
export function rowState(item: ComplianceItem, row: ComplianceRow | undefined, now = new Date()): 'done' | 'open' | 'overdue' {
  if (rowDone(item, row, now)) return 'done';
  const at = validAt(row);
  if (!at) return 'open';
  const sch = rowSchedule(item, at);
  return sch && now >= sch.nextDue ? 'overdue' : 'open';
}

export type AutoFacts = { userCount: number; auditEvents30d: number; drill?: { ok: boolean; at: string } | null };

export function itemState(item: ComplianceItem, rows: Map<string, ComplianceRow>, facts: AutoFacts, now = new Date()): ItemState {
  if (item.auto === 'access_log') return facts.auditEvents30d > 0 ? 'done' : 'open';
  if (item.auto === 'thresholds') return facts.userCount >= THRESHOLDS.dpo ? 'overdue' : 'done';
  if (item.auto === 'backup_drill') {
    const d = facts.drill;
    const t = d ? Date.parse(d.at) : NaN;
    if (!d || !Number.isFinite(t)) return 'open';
    if (!d.ok) return 'overdue';
    return now.getTime() - t > DRILL_MAX_AGE_DAYS * DAY ? 'overdue' : 'done';
  }
  if (item.subs) {
    const st = item.subs.map((s) => rowState(item, rows.get(`${item.key}:${s.key}`), now));
    const n = st.filter((x) => x === 'done').length;
    if (n === st.length) return 'done';
    if (st.includes('overdue')) return 'overdue';
    return n ? 'partial' : 'open';
  }
  return rowState(item, rows.get(item.key), now);
}

/** Earliest next-due date of an item (null when unknown/one-off/not yet done). */
export function itemNextDue(item: ComplianceItem, rows: Map<string, ComplianceRow>, facts: AutoFacts): Date | null {
  if (item.auto === 'backup_drill') {
    const t = facts.drill ? Date.parse(facts.drill.at) : NaN;
    return Number.isFinite(t) ? new Date(t + DRILL_MAX_AGE_DAYS * DAY) : null;
  }
  if (item.auto) return null;
  const keyRows = item.subs ? item.subs.map((s) => rows.get(`${item.key}:${s.key}`)) : [rows.get(item.key)];
  let best: Date | null = null;
  for (const r of keyRows) {
    const at = validAt(r);
    const sch = at ? rowSchedule(item, at) : null;
    if (sch && (!best || sch.nextDue < best)) best = sch.nextDue;
  }
  return best;
}

/** Items that were done but automatically reopened in (since, now] — for a one-time digest mention. */
export function reopenedItems(rows: Map<string, ComplianceRow>, facts: AutoFacts, since: Date, now = new Date()): ComplianceItem[] {
  return COMPLIANCE_ITEMS.filter((item) => {
    if (item.auto === 'backup_drill') {
      const t = facts.drill?.ok ? Date.parse(facts.drill.at) : NaN;
      const r = t + DRILL_MAX_AGE_DAYS * DAY;
      return Number.isFinite(r) && r > since.getTime() && r <= now.getTime();
    }
    if (item.auto) return false;
    const keyRows = item.subs ? item.subs.map((s) => rows.get(`${item.key}:${s.key}`)) : [rows.get(item.key)];
    return keyRows.some((r) => { const at = validAt(r); const sch = at ? rowSchedule(item, at) : null; return !!sch && sch.reopenAt > since && sch.reopenAt <= now; });
  });
}

/** Human interval label. */
export function intervalLabel(item: ComplianceItem): string | null {
  if (item.yearly) return 'כל שנה';
  const m = item.everyMonths ?? item.reviewMonths;
  if (item.auto === 'backup_drill') return 'כל חודש';
  return m ? (m === 12 ? 'כל שנה' : m === 24 ? 'כל שנתיים' : `כל ${m} חודשים`) : null;
}

/** Due date label for yearly items: 31 Dec of the current IL year. */
export const yearlyDue = (now = new Date()) => `31.12.${ilYear(now)}`;

export function openItems(rows: Map<string, ComplianceRow>, facts: AutoFacts, now = new Date()): ComplianceItem[] {
  return COMPLIANCE_ITEMS.filter((i) => itemState(i, rows, facts, now) !== 'done');
}
