/** R20 login-page messages (client-safe, no server imports). */
export const NO_LICENSE_COPY = 'עדיין אין לך מנוי ל-NuraWell';
export const NO_LICENSE_LINK = 'להצטרפות ל-NuraWell';
/** Public product page on the parent site. The visible label never includes this address. */
export const NO_LICENSE_HREF = 'https://platform-core-preview.vercel.app/products/nurawell/';

export const SIGNIN_ERRORS: Record<string, string> = {
  parent_unavailable: 'הכניסה בחשבון המרכזי לא זמינה כרגע. אפשר להתחבר כאן עם אימייל וסיסמה.',
  parent_no_account: 'לא נמצא חשבון NuraWell עם האימייל הזה. אפשר להירשם כאן, ובפעם הבאה הכניסה תעבוד גם בחשבון המרכזי.',
  parent_linked: 'החשבון כבר מחובר לחשבון מרכזי אחר. אפשר להתחבר כאן עם אימייל וסיסמה.',
  parent_no_license: NO_LICENSE_COPY,
};
