/** Rule-based Hebrew intrusion verdict. Product-agnostic and pure (no app imports). */
export type Facts = {
  sessionMethods: string[]; aal: string | null; failsBefore: number; newDevice: boolean; newCountry: boolean; knownPlace: boolean;
  exports: number; sensitiveRoutes: number; routes: number; refreshedOld: boolean; isAdmin: boolean; activeSessions: number;
};
export type Verdict = { level: 'low' | 'medium' | 'high'; headline: string; reasons: string[]; next: string[] };

const METHOD_HE: Record<string, string> = { password: 'סיסמה', totp: 'קוד אימות (TOTP)', otp: 'קוד/קישור במייל', magiclink: 'קישור במייל', oauth: 'חשבון חיצוני (OAuth)', sso: 'SSO', web3: 'ארנק', anonymous: 'אנונימי', token_refresh: 'חידוש חיבור', mfa: 'אימות דו-שלבי' };
export const methodHe = (m: string) => METHOD_HE[m] ?? m;

/** Rule-based Hebrew verdict. Pure, unit-tested. */
export function verdictFor(f: Facts): Verdict {
  const reasons: string[] = [];
  const next: string[] = [];
  let score = 0;
  const how = f.sessionMethods.length ? f.sessionMethods.map(methodHe).join(' + ') : 'לא ידוע';
  if (f.knownPlace) reasons.push('סימנת בעבר שהכתובת הזו שלך ("זה אני").');
  if (f.failsBefore >= 5) { score += 3; reasons.push(`${f.failsBefore} ניסיונות כושלים מאותה כתובת לפני ההצלחה: נראה כמו ניחוש סיסמה.`); next.push('החלף סיסמה מיד ובדוק שהיא לא בשימוש באתר אחר.'); }
  else if (f.failsBefore > 0) { score += 1; reasons.push(`${f.failsBefore} ניסיונות כושלים לפני ההצלחה.`); }
  if (f.sessionMethods.includes('password') && f.aal !== 'aal2') { score += 2; reasons.push('הכניסה הייתה עם סיסמה בלבד, בלי אימות דו-שלבי.'); next.push('אלץ איפוס סיסמה והרשמה מחדש לאימות.'); }
  if (f.aal === 'aal2' && !f.knownPlace) { score += 1; reasons.push('הכניסה עברה אימות דו-שלבי: ייתכן שגם הקוד או המכשיר השני נחשפו.'); }
  if (f.sessionMethods.some((m) => m === 'otp' || m === 'magiclink')) { score += 1; reasons.push('הכניסה הייתה בקישור או קוד שנשלח למייל: בדוק מי ניגש לתיבת המייל.'); next.push('החלף סיסמה גם בתיבת המייל והפעל בה אימות דו-שלבי.'); }
  if (f.sessionMethods.includes('oauth')) { score += 1; reasons.push('הכניסה הייתה דרך חשבון חיצוני: בדוק את האבטחה של החשבון ההוא.'); }
  if (f.refreshedOld) { score += 2; reasons.push('חיבור ישן חודש ממקום חדש: ייתכן שעוגיית החיבור הועתקה (גניבת סשן).'); next.push('נתק את החיבור הזה ואת כל החיבורים של החשבון.'); }
  if (f.newDevice && !f.knownPlace) { score += 1; reasons.push('מכשיר או דפדפן שלא נראו קודם בחשבון.'); }
  if (f.newCountry && !f.knownPlace) { score += 2; reasons.push('מדינה שלא נראתה קודם.'); }
  if (f.exports > 0) { score += 2; reasons.push(`בוצעו ${f.exports} ייצואים או הורדות מידע.`); next.push('בדוק אילו נתונים יוצאו, ושקול חובת דיווח לרשות להגנת הפרטיות.'); }
  if (f.isAdmin && f.sensitiveRoutes > 0) { score += 1; reasons.push(`נגישה ל-${f.sensitiveRoutes} מסכי ניהול רגישים.`); }
  if (f.knownPlace) score = Math.max(0, score - 3);
  const level: Verdict['level'] = score >= 5 ? 'high' : score >= 2 ? 'medium' : 'low';
  if (level !== 'low') { next.unshift('חסום את הכתובת.'); if (f.activeSessions) next.unshift('נתק את החיבור.'); }
  if (f.isAdmin && level === 'high') next.push('הפעל נעילת חירום.');
  const headline = level === 'high' ? `כנראה חדירה: נכנס עם ${how}` : level === 'medium' ? `חשוד: נכנס עם ${how}` : `נראה תקין: נכנס עם ${how}`;
  if (!reasons.length) reasons.push('לא נמצאו סימנים חריגים בנתונים שנשמרים.');
  return { level, headline, reasons, next: Array.from(new Set(next)) };
}
