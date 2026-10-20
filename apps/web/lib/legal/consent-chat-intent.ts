/**
 * Deterministic (no model) detection of an explicit request to change health-data consent.
 * Returns the requested action, or null. Conservative: needs a consent/privacy noun AND a
 * change verb, so passing mentions ("מה זה הסכמה?") do not trigger.
 */
import type { ConsentAction } from './consent-text';

const NOUN = /(הסכמ|הרשא|העדפות\s*(?:ה)?פרטיות|הגדרות\s*(?:ה)?פרטיות|מידע\s*(?:ה)?בריאותי|שמירת\s*(?:ה)?מידע)/;
const WITHDRAW = /(לבטל|תבטל|תבטלי|מבטל|מבטלת|ביטול|בטל|להסיר|תסיר|לחזור\s*בי|חוזר(?:ת)?\s*בי|לא\s*(?:רוצה|מסכים|מסכימה)\s*(?:יותר|עוד)?|למחוק|תמחק|לעצור|להפסיק|withdraw|revoke)/;
const GRANT = /(לתת|נותן|נותנת|אתן|להפעיל|תפעיל|תפעילי|מפעיל|להחזיר|לאשר|מאשר|מאשרת|אני\s*מסכים|אני\s*מסכימה|רוצה\s*(?:לתת\s*)?(?:את\s*)?(?:ה)?הסכמה|לחדש|grant|enable)/;
const CHANGE = /(לשנות|שינוי|לעדכן|עדכון|לנהל)/;
const QUESTION_ONLY = /^(מה|למה|איך|האם|מתי|איפה)\b[^]*\?\s*$/;

export function detectConsentChangeIntent(text: string): ConsentAction | 'change' | null {
  const t = String(text ?? '').trim();
  if (!t || t.length > 300) return null;
  if (!NOUN.test(t)) return null;
  const w = WITHDRAW.test(t);
  const gr = GRANT.test(t);
  if (w && !gr) return 'withdraw';
  if (gr && !w) return 'grant';
  if (CHANGE.test(t) || (w && gr)) return 'change';
  if (QUESTION_ONLY.test(t)) return null;
  return null;
}

/** The action to offer given the request and the current state. */
export function resolveConsentOffer(intent: ConsentAction | 'change', granted: boolean): ConsentAction {
  if (intent === 'change') return granted ? 'withdraw' : 'grant';
  return intent;
}

export function almogConsentReply(action: ConsentAction, gender: 'female' | 'male' | null, alreadyInState: boolean): string {
  const g = (f: string, m: string, n: string) => (gender === 'female' ? f : gender === 'male' ? m : n);
  if (action === 'grant') {
    return alreadyInState
      ? `ההסכמה שלך כבר פעילה 🙂 אם ${g('תרצי', 'תרצה', 'יתאים לך')} לעבור שוב על הפרטים, הכפתור כאן למטה.`
      : `בשמחה 🙂 בחלון ההסכמה ${g('תראי', 'תראה', 'אפשר לראות')} בדיוק מה נשמר ואיך, ו${g('תאשרי', 'תאשר', 'מאשרים')} בסימון ובמילה אחת. אין שום לחץ, ${g('קחי', 'קח', 'אפשר לקחת')} את הזמן. ${g('כשתהיי מוכנה', 'כשתהיה מוכן', 'כשמוכנים')}, הכפתור כאן למטה.`;
  }
  return alreadyInState
    ? `כרגע אין הסכמה פעילה, אז אני ממילא לא שומר מידע בריאותי. אם ${g('תרצי', 'תרצה', 'יתאים לך')} לראות את הפרטים, הכפתור כאן למטה.`
    : `בטח, זו ${g('זכותך', 'זכותך', 'זכות שלך')} המלאה. בביטול נמחקים המדידות, נתוני הבריאות בפרופיל וכל מה שזכרתי על בריאות ותזונה, ואני לא אדבר יותר על הנושאים האלה. כל השאר ממשיך כרגיל, ואפשר להפעיל שוב מתי ש${g('תרצי', 'תרצה', 'רוצים')}. בחלון ${g('תראי', 'תראה', 'רואים')} את הכול ו${g('תאשרי', 'תאשר', 'מאשרים')} בסימון ובמילה אחת. הכפתור כאן למטה.`;
}
