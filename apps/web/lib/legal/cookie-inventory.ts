/**
 * Single source of truth for the public cookie notice, panel and /cookies page.
 * Names and durations mirror the code that sets them (proxy.ts, lib/challenge/gate-cookie.ts,
 * lib/demo-access/cookie.ts, lib/ops/device-trust.ts, lib/a11y/constants.ts, ...).
 * Public copy: no vendor names, gender-neutral Hebrew.
 */
export type CookieItem = { name: string; label: string; what: string; duration: string; why: string };
export type CookieGroup = {
  id: string;
  title: string;
  short: string;
  kind: 'essential' | 'device' | 'unused';
  items: CookieItem[];
};

export const COOKIE_NOTICE_VERSION = '2026-10-20';
export const COOKIE_NOTICE_STORAGE_KEY = 'nurawell-cookie-notice';
export const COOKIE_WINK = 'שומר היער הקטן שלנו שומר רק על מה שצריך כדי שהאתר יעבוד. את שאר העוגיות? הוא כבר אכל.';

export const COOKIE_GROUPS: CookieGroup[] = [
  {
    id: 'auth',
    title: 'חיבור ואבטחה',
    short: 'שומרות על החיבור לחשבון ומגינות עליו.',
    kind: 'essential',
    items: [
      { name: 'sb-…-auth-token', label: 'עוגיית חיבור לחשבון', what: 'שומרת על החיבור לחשבון בצורה מאובטחת.', duration: 'עד התנתקות (מתחדשת)', why: 'בלעדיה צריך להתחבר מחדש בכל עמוד.' },
      { name: 'nw_la_at', label: 'עוגיית פעילות אחרונה', what: 'זוכרת מתי הייתה פעילות אחרונה, כדי לנתק אוטומטית אחרי חוסר פעילות.', duration: '30 יום', why: 'מגינה על החשבון אם שכחת להתנתק.' },
      { name: 'nw_cg', label: 'עוגיית אימות זהות', what: 'אישור קצר אחרי קוד או זיהוי ביומטרי, לפני פעולה רגישה.', duration: '3 דקות', why: 'מוודאת שזה באמת בעל החשבון.' },
      { name: 'nw_demo', label: 'עוגיית קישור הדגמה', what: 'גישה לקישור הדגמה שהתקבל.', duration: 'לפי תוקף הקישור, ועוד 7 ימים לסגירה בטוחה', why: 'בלעדיה קישור ההדגמה לא ייפתח.' },
    ],
  },
  {
    id: 'ops',
    title: 'ניהול האתר',
    short: 'פעילות רק אצל מנהלי האתר, לא אצל משתמשים רגילים.',
    kind: 'essential',
    items: [
      { name: 'nw_ops_dev', label: 'מכשיר מנהל מאושר', what: 'מזהה מכשיר מנהל שאושר.', duration: '180 יום', why: 'רק מכשירים מאושרים נכנסים לניהול.' },
      { name: 'nw_ops_pend', label: 'בקשת אישור מכשיר', what: 'בקשת אישור מכשיר שממתינה.', duration: '5 דקות', why: 'משלימה את אישור המכשיר בבטחה.' },
      { name: 'nw_ops_seen', label: 'כניסה אחרונה לניהול', what: 'זמן הכניסה האחרון ללוח הניהול.', duration: '12 שעות', why: 'מנתקת אוטומטית סשן ניהול ישן.' },
    ],
  },
  {
    id: 'device',
    title: 'העדפות במכשיר',
    short: 'נשמרות רק בדפדפן שלך (אחסון מקומי) ולא נשלחות אלינו.',
    kind: 'device',
    items: [
      { name: 'nurawell-a11y-preferences', label: 'הגדרות נגישות', what: 'גודל טקסט, ניגודיות ושאר ההעדפות שנבחרו.', duration: 'עד מחיקה ידנית', why: 'ההגדרות נשמרות בין ביקורים.' },
      { name: 'nura-lesson-audio-muted', label: 'השתקת שמע', what: 'האם השמע בשיעורים ובשאלות הושתק.', duration: 'עד מחיקה ידנית', why: 'לא נפעיל שמע כשלא רצית.' },
      { name: 'nurawell_guide_view_mode', label: 'תצוגת מדריכים', what: 'תצוגת המדריכים המועדפת.', duration: 'עד מחיקה ידנית', why: 'המדריכים נפתחים כמו שאהבת.' },
      { name: 'nurawell-cookie-notice', label: 'הודעת העוגיות', what: 'זוכרת שההודעה הזו כבר נקראה.', duration: 'עד מחיקה ידנית', why: 'כדי לא להציג אותה שוב ושוב.' },
    ],
  },
  { id: 'stats', title: 'מדידה וסטטיסטיקה', short: 'לא בשימוש. אין אצלנו כלי אנליטיקה.', kind: 'unused', items: [] },
  { id: 'ads', title: 'פרסום ושיווק', short: 'לא בשימוש, ולא יהיה בלי שנשאל קודם.', kind: 'unused', items: [] },
];

export const OPEN_COOKIE_PANEL_EVENT = 'nw:open-cookie-panel';
