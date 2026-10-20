/**
 * Rule-based log intelligence (no AI, no PII). Pure functions → unit-tested.
 * Input: normalized events from admin_audit_log (SECURITY) + delivery_log.
 * Output: per-event Hebrew explanation + severity, flow grouping ("stories"), anomalies, counters, trend vs baseline.
 */

export type Status = 'success' | 'failed' | 'warning' | 'pending' | 'security' | 'info';
export type Category = 'login' | 'email' | 'telegram' | 'push' | 'security' | 'device' | 'cron' | 'ai' | 'other';

export type LogEvent = {
  id: string;
  at: string; // ISO
  source: 'audit' | 'delivery';
  event: string; // audit path or `${channel}:${purpose}`
  actor: string | null; // short actor tag (never email)
  ok?: boolean | null;
  flowId?: string | null; // e.g. login request id
  detail: Record<string, unknown>; // already redacted
};

export type Explained = LogEvent & { status: Status; category: Category; severity: number; title: string; why: string; todo: string | null };

type Rule = { status: Status; category: Category; severity: number; title: string; why: string; todo?: string };

const RULES: Record<string, Rule> = {
  ops_login_pending: { status: 'pending', category: 'login', severity: 2, title: 'בקשת כניסה ממכשיר חדש', why: 'מישהו התחבר כמנהל ממכשיר שעוד לא מאושר. הכניסה נעצרה עד אישור.', todo: 'אם זה אתה — אשר בטלגרם או בקוד מהמייל. אם לא — לחץ "זה לא אני".' },
  ops_login_tg_sent: { status: 'success', category: 'telegram', severity: 0, title: 'כרטיס אישור נשלח בטלגרם', why: 'גדעון שלח לך כפתור אישור לכניסה.' },
  ops_login_tg_failed: { status: 'failed', category: 'telegram', severity: 6, title: 'כרטיס אישור בטלגרם לא נשלח', why: 'שליחת כפתור האישור לטלגרם נכשלה, אז לא קיבלת התראה.', todo: 'השתמש בקוד מהמייל, ובדוק את הגדרות הבוט של גדעון.' },
  ops_login_email_sent: { status: 'success', category: 'email', severity: 0, title: 'קוד כניסה נשלח במייל', why: 'קוד חד-פעמי בן 6 ספרות נשלח מ-gideon@.' },
  ops_login_email_failed: { status: 'failed', category: 'email', severity: 6, title: 'שליחת קוד במייל נכשלה', why: 'ספק המייל דחה את השליחה.', todo: 'נסה שוב או השתמש בקוד שחזור.' },
  ops_email_code_failed: { status: 'warning', category: 'login', severity: 4, title: 'קוד שגוי הוקלד', why: 'הוקלד קוד מייל לא נכון.', todo: 'אם זה לא אתה — מישהו מנסה לנחש. לחץ "זה לא אני".' },
  ops_email_code_locked: { status: 'security', category: 'security', severity: 8, title: 'הבקשה ננעלה אחרי ניסיונות שגויים', why: 'יותר מדי קודים שגויים — הבקשה בוטלה אוטומטית.', todo: 'אם לא אתה ניסית — החלף סיסמה.' },
  ops_login_approved: { status: 'success', category: 'login', severity: 1, title: 'הכניסה אושרה', why: 'המכשיר אושר בהצלחה.' },
  ops_login_onetap_bootstrap: { status: 'success', category: 'login', severity: 2, title: 'אישור בלחיצה אחת (הקמה)', why: 'אושר בלחיצה בטלגרם בחלון ההקמה הראשוני, לפני Face ID.' },
  ops_login_denied: { status: 'security', category: 'security', severity: 9, title: 'נלחץ "זה לא אני"', why: 'הכניסה נדחתה וכל החיבורים נותקו.', todo: 'החלף סיסמה ובדוק מכשירים מאושרים.' },
  ops_device_trusted: { status: 'success', category: 'device', severity: 1, title: 'מכשיר נוסף למאושרים', why: 'מעכשיו המכשיר נכנס ל-Ops בלי אישור נוסף.' },
  ops_device_revoked: { status: 'security', category: 'device', severity: 3, title: 'מכשיר הוסר', why: 'הגישה של המכשיר ל-Ops בוטלה.' },
  ops_handoff_created: { status: 'info', category: 'login', severity: 0, title: 'נוצר מעבר חד-פעמי ל-Ops', why: 'קישור כניסה לשימוש אחד, תקף 60 שניות.' },
  ops_handoff_used: { status: 'success', category: 'login', severity: 0, title: 'המעבר ל-Ops נוצל', why: 'הקישור החד-פעמי נוצל בהצלחה.' },
  ops_handoff_replay: { status: 'security', category: 'security', severity: 8, title: 'ניסיון שימוש חוזר בקישור', why: 'מישהו ניסה להשתמש שוב בקישור כניסה שכבר נוצל.', todo: 'אם לא אתה — החלף סיסמה.' },
  ops_handoff_client_mismatch: { status: 'security', category: 'security', severity: 8, title: 'קישור נפתח מדפדפן אחר', why: 'קישור הכניסה נפתח במכשיר שונה מזה שביקש אותו — נחסם.', todo: 'אם לא אתה — לחץ "זה לא אני".' },
  ops_ingest_rejected: { status: 'warning', category: 'login', severity: 3, title: 'כניסה ל-Ops נדחתה', why: 'קישור הכניסה לא היה תקף (פג, נוצל או שגוי).' },
  ops_session_minted: { status: 'success', category: 'login', severity: 0, title: 'נפתח חיבור ל-Ops', why: 'החיבור ל-Ops נוצר אחרי מעבר תקין.' },
  ops_sessions_revoked: { status: 'security', category: 'security', severity: 7, title: 'כל החיבורים נותקו', why: 'כל החיבורים ל-Ops בוטלו.' },
  ops_recovery_codes_generated: { status: 'info', category: 'security', severity: 2, title: 'נוצרו קודי שחזור', why: '10 קודים חדשים; הקודמים בוטלו.', todo: 'שמור אותם במקום בטוח.' },
  ops_recovery_code_used: { status: 'warning', category: 'security', severity: 4, title: 'נוצל קוד שחזור', why: 'כניסה אושרה בקוד שחזור.', todo: 'אם לא אתה — צור קודים חדשים והחלף סיסמה.' },
  ops_recovery_failed: { status: 'warning', category: 'security', severity: 4, title: 'קוד שחזור שגוי', why: 'הוקלד קוד שחזור לא נכון.' },
  ops_recovery_locked: { status: 'security', category: 'security', severity: 8, title: 'קודי שחזור ננעלו', why: 'יותר מדי ניסיונות שגויים.' },
  kill_switch_on: { status: 'security', category: 'security', severity: 9, title: 'מתג חירום הופעל', why: 'כל הפעולות הרגישות של גדעון הוקפאו.' },
  rate_limited: { status: 'warning', category: 'security', severity: 3, title: 'משתמש נחסם זמנית על עומס בקשות', why: 'נשלחו יותר מדי בקשות בזמן קצר, אז הבקשות הנוספות נעצרו לכמה שניות.' },
  rate_limit_fallback: { status: 'warning', category: 'security', severity: 5, title: 'מגביל הבקשות עבר למצב גיבוי', why: 'מסד הנתונים של מגביל הבקשות לא ענה, אז ההגבלה עובדת רק בתוך כל שרת בנפרד ופחות מדויקת.', todo: 'בדוק שמסד הנתונים זמין. אם זה חוזר, פנה לגדעון.' },
  rate_limit_fallback_spike: { status: 'security', category: 'security', severity: 8, title: 'תקלה חוזרת במגביל הבקשות', why: 'עשרות בקשות בדקות ספורות עברו למצב גיבוי — ההגנה מפני הצפת בקשות חלשה כרגע.', todo: 'בדוק מיד את זמינות מסד הנתונים. גדעון מקבל התראה על זה.' },
  stepup_failed: { status: 'warning', category: 'security', severity: 4, title: 'אימות Face ID נכשל', why: 'אימות ביומטרי בטלגרם לא עבר.' },
  stepup_locked: { status: 'security', category: 'security', severity: 8, title: 'Face ID ננעל', why: 'יותר מדי כישלונות אימות.' },
  anomaly: { status: 'security', category: 'security', severity: 7, title: 'זוהתה חריגה', why: 'המערכת זיהתה דפוס חריג.' },
};

export function explain(e: LogEvent): Explained {
  if (e.source === 'delivery') {
    const [ch, purpose] = e.event.split(':');
    const category: Category = ch === 'email' ? 'email' : ch === 'telegram' ? 'telegram' : ch === 'push' ? 'push' : 'other';
    const name = category === 'email' ? 'מייל' : category === 'telegram' ? 'הודעת טלגרם' : category === 'push' ? 'התראת פוש' : 'הודעה';
    return e.ok
      ? { ...e, status: 'success', category, severity: 0, title: `${name} נשלח`, why: `נשלח בהצלחה (${purpose || 'כללי'}).`, todo: null }
      : { ...e, status: 'failed', category, severity: 5, title: `${name} לא נשלח/ה`, why: `הספק החזיר שגיאה (${purpose || 'כללי'}).`, todo: 'אם זה חוזר — בדוק הגדרות ספק ומפתחות.' };
  }
  const r = RULES[e.event];
  if (r) return { ...e, status: r.status, category: r.category, severity: r.severity, title: r.title, why: r.why, todo: r.todo ?? null };
  const failed = /fail|error|denied|reject/i.test(e.event);
  return { ...e, status: failed ? 'failed' : 'info', category: /cron|digest/.test(e.event) ? 'cron' : /ai|llm/.test(e.event) ? 'ai' : 'other', severity: failed ? 4 : 0, title: e.event.replace(/_/g, ' '), why: failed ? 'פעולה נכשלה.' : 'אירוע מערכת.', todo: null };
}

/* ───────── stories: correlate one flow ───────── */
export type Story = { id: string; start: string; end: string; events: Explained[]; outcome: Status; severity: number; headline: string };

export function groupStories(evs: Explained[]): Story[] {
  const by = new Map<string, Explained[]>();
  for (const e of evs) {
    if (!e.flowId) continue;
    const a = by.get(e.flowId) ?? [];
    a.push(e);
    by.set(e.flowId, a);
  }
  const out: Story[] = [];
  for (const [id, list] of by) {
    if (list.length < 2) continue;
    list.sort((a, b) => a.at.localeCompare(b.at));
    const names = new Set(list.map((x) => x.event));
    let outcome: Status = 'pending';
    let headline = 'ניסיון כניסה — ממתין לאישור';
    if (names.has('ops_login_denied')) { outcome = 'security'; headline = 'ניסיון כניסה נדחה ("זה לא אני")'; }
    else if (names.has('ops_email_code_locked') || names.has('ops_recovery_locked')) { outcome = 'security'; headline = 'ניסיון כניסה ננעל אחרי קודים שגויים'; }
    else if (names.has('ops_login_approved') || names.has('ops_device_trusted')) { outcome = 'success'; headline = 'כניסה ממכשיר חדש אושרה'; }
    else if ([...names].some((n) => /failed/.test(n))) { outcome = 'warning'; headline = 'ניסיון כניסה — חלק מהשליחות נכשלו'; }
    out.push({ id, start: list[0].at, end: list[list.length - 1].at, events: list, outcome, severity: Math.max(...list.map((x) => x.severity)), headline });
  }
  return out.sort((a, b) => b.end.localeCompare(a.end));
}

/* ───────── anomalies ───────── */
export type Anomaly = { key: string; severity: number; title: string; why: string; todo: string; at: string };

const ilHour = (iso: string) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', hourCycle: 'h23' }).format(new Date(iso)));

export function detectAnomalies(evs: Explained[], knownPlaces: Set<string> = new Set(), now = Date.now()): Anomaly[] {
  const out: Anomaly[] = [];
  const recent = (ms: number) => evs.filter((e) => now - Date.parse(e.at) <= ms);
  const hour = recent(3_600_000);

  const fails = hour.filter((e) => e.status === 'failed');
  const byCat = new Map<string, number>();
  for (const f of fails) byCat.set(f.category, (byCat.get(f.category) ?? 0) + 1);
  for (const [cat, n] of byCat) if (n >= 5) out.push({ key: `burst:${cat}`, severity: n >= 20 ? 8 : 6, title: `גל כישלונות שליחה (${cat})`, why: `${n} כישלונות בשעה האחרונה.`, todo: 'בדוק ספק/מפתחות; ייתכן שהשירות למטה.', at: fails[0].at });

  const wrong = hour.filter((e) => e.event === 'ops_email_code_failed' || e.event === 'ops_recovery_failed' || e.event === 'stepup_failed');
  if (wrong.length >= 3) out.push({ key: 'guessing', severity: 8, title: 'ניסיונות חוזרים של קודים שגויים', why: `${wrong.length} קודים שגויים בשעה האחרונה — ייתכן ניחוש.`, todo: 'אם זה לא אתה — לחץ "זה לא אני" והחלף סיסמה.', at: wrong[0].at });

  for (const e of recent(86_400_000).filter((x) => x.event === 'ops_login_pending')) {
    const place = String(e.detail.location ?? '');
    const dev = String(e.detail.label ?? '');
    if (place && knownPlaces.size && !knownPlaces.has(place)) out.push({ key: `geo:${e.id}`, severity: 7, title: 'כניסה ממיקום חדש', why: `ניסיון כניסה מ-${place} (${dev}) — מיקום שלא נראה קודם.`, todo: 'אם זה לא אתה — לחץ "זה לא אני".', at: e.at });
    const h = ilHour(e.at);
    if (h >= 2 && h < 6) out.push({ key: `hour:${e.id}`, severity: 5, title: 'ניסיון כניסה בשעה חריגה', why: `ניסיון כניסה בשעה ${h}:00 לפי שעון ישראל.`, todo: 'ודא שזה היית אתה.', at: e.at });
  }
  const sec = recent(86_400_000).filter((e) => ['ops_handoff_replay', 'ops_handoff_client_mismatch', 'ops_login_denied', 'stepup_locked', 'ops_recovery_locked', 'ops_email_code_locked'].includes(e.event));
  for (const e of sec) out.push({ key: `sec:${e.id}`, severity: e.severity, title: e.title, why: e.why, todo: e.todo ?? 'בדוק את החשבון.', at: e.at });
  return out.sort((a, b) => b.severity - a.severity);
}

/* ───────── counters + trend ───────── */
export type Summary = { total: number; byStatus: Record<Status, number>; failRate: number; baselineFailRate: number; trend: 'up' | 'down' | 'flat' };

export function summarize(window: Explained[], baseline: Explained[]): Summary {
  const byStatus = { success: 0, failed: 0, warning: 0, pending: 0, security: 0, info: 0 } as Record<Status, number>;
  for (const e of window) byStatus[e.status] += 1;
  const rate = (l: Explained[]) => (l.length ? l.filter((e) => e.status === 'failed').length / l.length : 0);
  const failRate = rate(window);
  const baselineFailRate = rate(baseline);
  const trend = failRate > baselineFailRate * 1.5 + 0.02 ? 'up' : failRate < baselineFailRate * 0.67 - 0.02 ? 'down' : 'flat';
  return { total: window.length, byStatus, failRate, baselineFailRate, trend };
}
