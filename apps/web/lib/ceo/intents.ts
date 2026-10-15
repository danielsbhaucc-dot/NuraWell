/**
 * Deterministic fast-path for common, high-stakes intents (no LLM guesswork).
 * Demo link: "תפתח גישה לאלכס עם קישור דמו", "תן לאלכס גישה", "תעשה לינק דמו לדנה ליומיים", "דמו בשביל יוסי לשבוע".
 */
export type DemoIntent = { guest_name?: string; hours: number };

const VERB = /(תפתח|פתח|תן|תני|תביא|תכין|הכן|תעשה|תעשי|עשה|צור|תיצור|תייצר|שלח|תשלח|תוציא|אפשר|בא\s+נ?פתח|צריך|רוצה|תסדר|סדר)/;
const OBJ = /(דמו|גישה|גישת|לינק|קישור)/;
const DEMO_HINT = /(דמו|demo|גישה זמנית|גישת אורח|לינק\s+גישה|קישור\s+גישה)/i;
const QUESTION_ABOUT = /^(מה|מי|למה|כמה|איך|האם|איפה|מתי)\b/;
const STOP = new Set(['לי', 'לו', 'לה', 'לנו', 'להם', 'לך', 'לינק', 'לינקים', 'ליום', 'ליומיים', 'לשבוע', 'לשבועיים', 'לשעה', 'לשעתיים', 'למערכת', 'לדמו', 'לגישה', 'לקישור', 'למשך', 'לחשבון', 'לאפליקציה', 'לאתר', 'לכמה', 'לפחות', 'למחר', 'להיום', 'לבדיקה', 'לנסות', 'לראות', 'לקבל', 'לפתוח', 'לתת', 'לא', 'לכל', 'לפני', 'לבד']);
const ADDRESS = new Set(['גדעון', 'אחי', 'נשמה', 'גבר', 'מותק']);

function hoursOf(t: string): number {
  if (/שבועיים/.test(t)) return 168; // max is 7 days
  if (/שבוע/.test(t)) return 168;
  if (/יומיים/.test(t)) return 48;
  const d = t.match(/(\d+)\s*ימים/);
  if (d) return Math.min(168, Number(d[1]) * 24);
  if (/שעתיים/.test(t)) return 2;
  const h = t.match(/(\d+)\s*שעות/);
  if (h) return Math.max(1, Math.min(168, Number(h[1])));
  if (/לשעה\b|שעה אחת/.test(t)) return 1;
  return 24;
}

function nameOf(t: string): string | undefined {
  const form = t.match(/(?:בשביל|עבור|של)\s+([א-ת][א-ת'"׳-]{1,20})/);
  if (form && !STOP.has(`ל${form[1]}`) && !ADDRESS.has(form[1]) && !/^(דמו|גישה|קישור|לינק)$/.test(form[1])) return form[1];
  for (const m of t.matchAll(/(?:^|[\s,])ל([א-ת][א-ת'"׳-]{1,20})/g)) {
    const w = `ל${m[1]}`;
    if (STOP.has(w) || ADDRESS.has(m[1])) continue;
    if (/^(דמו|גישה|קישור|לינק|משתמש|אורח|מישהו|מישהי)/.test(m[1])) continue;
    return m[1];
  }
  return undefined;
}

export function detectDemoIntent(text: string): DemoIntent | null {
  const t = text.replace(/[?!.]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (t.length > 200 || QUESTION_ABOUT.test(t)) return null;
  if (/(בטל|תבטל|מחק|תמחק|סגור|תסגור|נתק|תנתק|חסום|כמה|רשימת|תראה לי את)/.test(t)) return null;
  const demoish = DEMO_HINT.test(t) || (VERB.test(t) && OBJ.test(t) && /גישה/.test(t));
  if (!demoish || (!VERB.test(t) && !/^(דמו|לינק דמו|קישור דמו)\s+ל?[א-ת]{2,}/.test(t))) return null;
  // more than one guest ("לאלכס ולדנה") or an explicit account choice → let the model chain/clarify
  if (/(^|\s)ל[א-ת]{2,}\s+ול?[א-ת]{2,}/.test(t)) return null;
  if (/(בחשבון|לחשבון|על החשבון|כמשתמש)/.test(t)) return null;
  const guest_name = nameOf(t);
  return { ...(guest_name ? { guest_name } : {}), hours: hoursOf(t) };
}
