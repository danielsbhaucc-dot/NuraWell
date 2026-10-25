-- Autonomous legal & compliance task list (Ops → אבטחה ופרטיות). Admin-only (RLS + server guard).
-- Costs are market estimates, not quotes. "required" only where the 2017 Data Security Regulations / Amendment 13 say so
-- per docs/security/PRIVACY_COMPLIANCE_IL.he.md; everything uncertain is "recommended".

create table if not exists public.compliance_tasks (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  explanation text not null,
  legal_why text not null,
  requirement text not null default 'recommended' check (requirement in ('required','recommended')),
  cost_estimate text,
  status text not null default 'open' check (status in ('open','in_progress','done','not_relevant')),
  recurrence text not null default 'one_time' check (recurrence in ('one_time','monthly','quarterly','yearly')),
  next_due date,
  last_done date,
  owner text not null default 'daniel' check (owner in ('daniel','automatic')),
  evidence text check (evidence is null or length(evidence) <= 2000),
  sort_order int not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create index if not exists compliance_tasks_next_due_idx on public.compliance_tasks (next_due);

alter table public.compliance_tasks enable row level security;
alter table public.compliance_tasks force row level security;
revoke all on public.compliance_tasks from public, anon;
grant select, update on public.compliance_tasks to authenticated;
grant all on public.compliance_tasks to service_role;

drop policy if exists compliance_tasks_admin_select on public.compliance_tasks;
create policy compliance_tasks_admin_select on public.compliance_tasks for select to authenticated using (public.is_admin());
drop policy if exists compliance_tasks_admin_update on public.compliance_tasks;
create policy compliance_tasks_admin_update on public.compliance_tasks for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Due / overdue tasks for the recurring check (service_role only). Recurring tasks come back when next_due arrives, even after "done".
create or replace function public.compliance_tasks_due(p_within_days int default 14)
returns setof public.compliance_tasks
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select * from public.compliance_tasks t
  where t.status <> 'not_relevant'
    and t.next_due is not null
    and t.next_due <= (now() at time zone 'Asia/Jerusalem')::date + greatest(p_within_days, 0)
    and (t.status <> 'done' or t.recurrence <> 'one_time')
  order by t.next_due, t.sort_order;
$$;
revoke all on function public.compliance_tasks_due(int) from public, anon, authenticated;
grant execute on function public.compliance_tasks_due(int) to service_role;

insert into public.compliance_tasks (slug, sort_order, title, explanation, legal_why, requirement, cost_estimate, recurrence, next_due, owner, evidence) values
('dpo-appoint', 10, 'מינוי ממונה הגנת פרטיות חיצוני',
 'בעל מקצוע מחוץ לחברה שמלווה את נושא הפרטיות, עונה לפניות של משתמשים ושל הרשות ובודק שאנחנו עומדים בחוק. לא צריך עובד במשרה: יש משרדים שנותנים את זה כשירות חודשי. ממונה אחד מכסה את כל המיזמים של אותה ישות משפטית, כך שגם מערכות עתידיות בחנות ייכנסו תחתיו.',
 'תיקון 13 לחוק הגנת הפרטיות (בתוקף מ-14.8.2025) מחייב למנות ממונה כשעיקר הפעילות הוא עיבוד מידע רגיש בהיקף ניכר. מידע בריאותי הוא מידע רגיש, אבל לפני ההשקה ההיקף קטן, ולכן החובה גבולית. אחרי ההשקה סביר שתחול.',
 'recommended',
 'הערכת שוק: DPOS מכ-1,600 ₪ + מע"מ לחודש · DPO Israel כ-4,500–6,500 ₪ לחודש · DPO Lex: מחיר לא מפורסם · משרדי עורכי דין: פרל כהן, ארנון תדמור-לוי (לפי הצעת מחיר)',
 'one_time', '2026-12-31', 'daniel', null),
('privacy-lawyer-opinion', 20, 'חוות דעת של עורך דין פרטיות',
 'עורך דין שמתמחה בפרטיות עובר על מדיניות הפרטיות, התנאים ומסמכי האבטחה ומאשר בכתב שהם עומדים בחוק, או אומר מה לתקן.',
 'מסמכי העמידה בחוק נכתבו כהערכה טכנית בלבד. חוות דעת חתומה היא ההגנה החזקה ביותר אם תוגש תביעה או תיפתח בדיקה של הרשות, והיא גם מכריעה בשאלות הפתוחות: חובת ממונה, הודעה לרשות, העברת מידע לחו"ל ותקופות שמירה.',
 'recommended', 'הערכת שוק: כ-3,000–8,000 ₪, תשלום חד־פעמי', 'one_time', '2026-12-31', 'daniel', null),
('pentest-external', 30, 'בדיקת חדירה חיצונית',
 'חברת אבטחה עצמאית מנסה לפרוץ למערכת ומגישה דוח. כך אפשר לדעת שהמערכת מאובטחת בלי להסתמך רק על מי שבנה אותה. בפעם הראשונה לפני שמגיעים להרבה משתמשים, ואחר כך פעם בשנה.',
 'התקנות מחייבות ביקורת אבטחה תקופתית. בדיקת חדירה עצמה לא מחויבת ברמת האבטחה הבינונית שבה אנחנו נמצאים, אבל היא הראיה החזקה ביותר לכך שננקטו אמצעים סבירים.',
 'recommended', 'הערכת שוק: כ-8,000–20,000 ₪ לבדיקה', 'yearly', '2027-03-31', 'daniel', null),
('cyber-insurance', 40, 'ביטוח סייבר',
 'ביטוח שמכסה הוצאות ותביעות אם בכל זאת קורה אירוע אבטחה: חקירה, הודעה למשתמשים, ייעוץ משפטי ופיצויים.',
 'לא נדרש בחוק. מקטין את הסיכון הכספי אם קורה אירוע.',
 'recommended', 'הערכת שוק: כ-150–400 ₪ לחודש', 'one_time', '2027-01-31', 'daniel', null),
('backup-restore-test', 50, 'בדיקת שחזור מגיבוי',
 'משחזרים את הגיבוי האחרון לסביבה נפרדת וזמנית, בודקים שכל המידע חזר ומוחקים את הסביבה. כך מוודאים שהגיבוי באמת עובד ביום שצריך אותו.',
 'תקנה 17 לתקנות אבטחת מידע (2017) מחייבת גיבוי ונוהל שחזור. התדירות הרבעונית היא המלצה שלנו (BACKUP_RESTORE_TEST).',
 'required', null, 'quarterly', '2026-11-15', 'automatic', 'docs/security/BACKUP_RESTORE_TEST.he.md'),
('key-backup-drill', 60, 'בדיקת גיבוי מפתחות ההצפנה',
 'מוודאים שאפשר לשחזר את מפתחות ההצפנה מהגיבוי: מצפינים מידע לדוגמה, משחזרים בכל אחת מהדרכים ומוודאים שחלק אחד לבד לא מספיק.',
 'בלי מפתחות אין גישה למידע המוצפן. שמירת זמינות המידע היא חלק מחובת האבטחה, והתדירות היא המלצה (key-backup).',
 'recommended', null, 'quarterly', '2026-11-30', 'automatic', 'docs/security/key-backup.md'),
('access-review', 70, 'סקירת הרשאות גישה',
 'עוברים על כל מי ומה שיש לו גישה למערכת ולמידע: חשבונות ניהול, מפתחות, חשבונות שירות בענן וגישות של סוכנים אוטומטיים, ומבטלים כל מה שלא נחוץ.',
 'תקנות 8–9 מחייבות ניהול הרשאות לפי הצורך בלבד. הסקירה הרבעונית היא הדרך שלנו לעמוד בזה.',
 'required', null, 'quarterly', '2026-12-31', 'automatic', null),
('account-2fa-review', 80, 'בדיקת אבטחת החשבונות הראשיים',
 'מוודאים שבכל החשבונות הראשיים (מייל, GitHub, שרתים, ענן, מסד נתונים, אחסון) מופעל אימות דו־שלבי, ומוחקים הרשאות וטוקנים ישנים. חלק מהבדיקה דורש כניסה שלך לחשבונות.',
 'חשבון ראשי פרוץ הוא הדרך הנפוצה ביותר לדליפות. נובע מחובת ההזדהות וניהול ההרשאות בתקנות; התדירות היא המלצה (ACCOUNT_POSTURE).',
 'recommended', null, 'quarterly', '2026-12-31', 'daniel', 'docs/security/ACCOUNT_POSTURE.he.md'),
('access-log-review', 90, 'בדיקת יומני הגישה',
 'בודקים שיומני הגישה של מערכת הניהול נכתבים, נשמרים לפחות 24 חודשים ושאין בהם גישה חריגה.',
 'תקנה 10 מחייבת תיעוד גישה ושמירה של 24 חודשים לפחות. הבדיקה החודשית היא המלצה.',
 'required', null, 'monthly', '2026-11-25', 'automatic', null),
('retention-purge-check', 100, 'וידוא מחיקה אוטומטית של מידע ישן',
 'בודקים שהמחיקה האוטומטית של מידע שעבר את תקופת השמירה באמת רצה, ושמחיקת חשבון מוחקת את כל המידע של המשתמש.',
 'חוק הגנת הפרטיות דורש לא להחזיק מידע מעבר לנדרש. התדירות היא המלצה (RETENTION_DELETION).',
 'recommended', null, 'quarterly', '2026-12-15', 'automatic', 'docs/security/RETENTION_DELETION.he.md'),
('data-map-review', 110, 'עדכון מסמך הגדרות המאגר ומפת המידע',
 'מעדכנים את המסמך שמתאר איזה מידע נאסף, למה, איפה הוא נשמר ומי מקבל אותו.',
 'תקנה 2 מחייבת מסמך הגדרות מאגר ועדכון שלו אחת לשנה לפחות.',
 'required', null, 'yearly', '2027-10-25', 'automatic', 'docs/security/DATA_MAP.he.md'),
('security-procedure-review', 120, 'סקירת נוהל אבטחת המידע',
 'עוברים על נוהל האבטחה ומעדכנים אותו לפי מה שהשתנה במערכת במהלך השנה.',
 'תקנה 4 מחייבת נוהל אבטחה כתוב ובדיקה שלו אחת לשנה לפחות.',
 'required', null, 'yearly', '2027-10-25', 'automatic', 'docs/security/PRIVACY_COMPLIANCE_IL.he.md'),
('periodic-security-audit', 130, 'ביקורת אבטחת מידע תקופתית',
 'ביקורת מסודרת של כל אמצעי האבטחה מול התקנות, עם דוח וממצאים לתיקון.',
 'תקנה 16 מחייבת ביקורת לפחות אחת ל-24 חודשים ברמת אבטחה בינונית. בחרנו לעשות אותה כל שנה.',
 'required', null, 'yearly', '2027-10-25', 'automatic', null),
('incident-drill', 140, 'תרגול תגובה לאירוע אבטחה',
 'מתרגלים תרחיש של דליפה: מי עושה מה בשעה הראשונה, איך שומרים ראיות ואיך מדווחים לרשות בזמן.',
 'תקנה 11 מחייבת דיווח מיידי לרשות על אירוע אבטחה חמור. התרגול עצמו הוא המלצה שמוודאת שנעמוד בזה (INCIDENT_RESPONSE).',
 'recommended', null, 'yearly', '2027-04-30', 'automatic', 'docs/security/INCIDENT_RESPONSE.he.md'),
('privacy-policy-review', 150, 'סקירת מדיניות הפרטיות',
 'בודקים שמדיניות הפרטיות עדיין מתארת נכון מה המערכת עושה: ספקים חדשים, סוגי מידע חדשים ותקופות שמירה.',
 'חובת היידוע בחוק דורשת שהמידע שמשתמשים מקבלים יהיה נכון. הסקירה השנתית היא המלצה.',
 'recommended', null, 'yearly', '2027-10-25', 'automatic', null),
('vendor-dpa', 160, 'הסכמי עיבוד מידע עם הספקים',
 'אוספים ושומרים את הסכמי עיבוד המידע של כל הספקים שמעבדים מידע של משתמשים (אחסון, שרתים, ענן, ספקי AI). אצל רובם ההסכם זמין באתר או מתקבל בבקשה.',
 'תקנה 15 מחייבת הסדר בכתב עם כל מי שמקבל גישה למידע במיקור חוץ.',
 'required', null, 'one_time', '2026-12-15', 'automatic', null),
('overseas-transfer-basis', 170, 'בסיס חוקי להעברת מידע לחו"ל',
 'מתעדים לאילו מדינות המידע עובר (ספקים בארה"ב ובאירופה) ועל סמך מה זה מותר.',
 'העברת מידע אל מחוץ לישראל כפופה לתקנות ההעברה. סביר שהעברה לאירופה מותרת, אבל צריך אישור של עורך דין.',
 'recommended', null, 'one_time', '2026-12-31', 'daniel', null),
('authority-notice-check', 180, 'בדיקת חובת רישום או הודעה לרשות',
 'בודקים עם עורך דין אם צריך לרשום את המאגר או לשלוח הודעה לרשות להגנת הפרטיות.',
 'אחרי תיקון 13 חובת הרישום צומצמה, וכנראה לא חלה עלינו. הודעה לרשות נדרשת רק מ-100,000 נושאי מידע. אנחנו מתחת לסף, ולכן זו בדיקה ולא חובה.',
 'recommended', null, 'one_time', '2026-12-31', 'daniel', null)
on conflict (slug) do nothing;
