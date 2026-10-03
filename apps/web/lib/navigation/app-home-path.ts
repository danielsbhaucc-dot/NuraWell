/** נתיב ברירת המחדל למשתמש מחובר אחרי התחברות / onboarding */
export const APP_HOME_PATH = '/home';

/** דף הבית הציבורי (שיווק) — לא מבלבלים עם APP_HOME_PATH */
export const PUBLIC_HOME_PATH = '/';

/** דפי שיווק שמשתמש מחובר (עם אימייל מאומת) מופנה מהם לאפליקציה */
export const MARKETING_PATHS_REDIRECT_WHEN_AUTHED = ['/', '/v2'] as const;
