/**
 * Notification State — ה"מכונת מצבים" של מנוע ההתראות.
 *
 * נגזרת דטרמיניסטית מתוך:
 *   • timeOfDay        — איזה קרון הופעל (08:00 / 13:00 / 20:00).
 *   • consecutiveMissedDays — מספר ימים *רצופים* שהמשתמש *לא* השלים את המשימה
 *                              (לא כולל היום הנוכחי).
 *
 * החישוב נעשה ב-`deriveNotificationState` (קובץ נפרד). ה-state עצמו
 * משמש *פנימית בלבד* (לחישוב cadence + רישום ב-notification_logs לאדמין).
 * ה-AI לא מקבל אותו — הוא מקבל הקשר דו-ממדי גולמי
 * (`AINotificationContext`) ומחליט לבד על הטון.
 *
 * הקובץ הוא types-only בלי side-effects, כדי שכל strata
 * (server / workflow / UI) יוכל לייבא בלי תלות runtime.
 */

export const TIME_OF_DAY = ['morning', 'noon', 'evening'] as const;
export type TimeOfDay = (typeof TIME_OF_DAY)[number];

export const NOTIFICATION_STATES = [
  'MORNING_KICKOFF',
  'NOON_CHECK',
  'EVENING_CHECK',
  'DAY_2_MISSED',
  'DAY_3_MISSED',
  'DORMANT',
] as const;
export type NotificationState = (typeof NOTIFICATION_STATES)[number];

/** Cadence — האם המצב הזה רץ יומי (default) או שבועי (DORMANT). */
export type NotificationCadence = 'daily' | 'weekly';

/**
 * זיכרון ארוך-טווח של ה-AI — תובנות אחרונות מהפירמידה (`periodic_summaries`).
 *
 * נשלף ב-`getUsersForNotification` ב-batch אחד לכל המועמדים (אחד במקום N
 * שאילתות), ומוטמע בהקשר ה-AI כדי שההתראה תרגיש "אתה זוכר אותי" במקום
 * אנונימית.
 *
 * כל השדות אופציונליים — אם אין סיכום שבועי/חודשי במשתמש, פשוט לא נשלח.
 * ה-prompt בנוי בצורה שאם השדות חסרים, האווטאר נשמע בדיוק כמו לפני
 * Phase 3 (zero-regression).
 */
export interface AINotificationMemory {
  /** ה-ai_insight של הסיכום השבועי האחרון (max ~250 תווים בפועל). */
  latest_weekly_insight?: string;
  /** מתי נוצר אותו שבועי (period_key, e.g. '2026-W22'). debug-only. */
  latest_weekly_period?: string;
  /** ה-ai_insight של הסיכום החודשי האחרון. */
  latest_monthly_insight?: string;
  /** מתי נוצר אותו חודשי (period_key, e.g. '2026-M05'). debug-only. */
  latest_monthly_period?: string;
}

/**
 * "אזרח סוג א'" של המנוע: מה ש-`getUsersForNotification` מחזיר ומה ש-Workflow
 * מעביר ל-OpenAI כפרומפט מובנה.
 */
export interface NotificationCandidate {
  userId: string;
  firstName: string;
  taskName: string;
  notificationState: NotificationState;
  /** למחקר / debug: כמה ימים רצוף לא בוצעה המשימה (לא כולל היום). */
  consecutiveMissedDays: number;
  /** מאיזה slot הגיעה ההחלטה — לוג לבדיקות. */
  timeOfDay: TimeOfDay;
  /**
   * זיכרון ארוך-טווח (Phase 3). אופציונלי — אם המשתמש חדש או אין לו
   * עדיין סיכומים תקופתיים, השדה לא יהיה כאן בכלל.
   */
  aiMemory?: AINotificationMemory;
}

/**
 * הקשר דו-ממדי שעובר ל-LLM כתוכן JSON בתוך user message,
 * אחרי שה-system prompt קבע את "אישיות אלמוג".
 *
 * 🚨 הכלל המכריע (מוטמע גם בקוד וגם בפרומפט):
 *   אם `has_completed_today === true` → לעולם לא מגיעים ל-LLM. ה-filter
 *   מתבצע ב-Supabase ב-`getUsersForNotification`. השדה כאן הוא הגנה
 *   defensive — אם איכשהו "true" יגיע ל-AI, יש להפסיק.
 *
 * חוזה הפלט של ה-LLM: טקסט push קצר (max 15 מילים) — לא JSON, רק body.
 */
export interface AINotificationContext {
  user_first_name: string;
  task_name: string;
  time_of_day: TimeOfDay;
  /**
   * מספר ימים *רצופים לפני היום* שהמשתמש לא ביצע.
   *   0 = רק היום הוא עוד לא סימן (אתמול בוצע / זה היום הראשון).
   *   1 = אתמול גם הוא לא סימן וגם היום.
   *   2+ = מספר ימים רצופים — בדרך לנשירה.
   */
  consecutive_missed_days: number;
  /**
   * ב-runtime תמיד false (כי סוננו ב-DB). נשמר ב-payload כהגנה defensive
   * ולמתן הקשר מלא ל-AI לפי המפרט.
   */
  has_completed_today: boolean;
  /**
   * זיכרון ארוך-טווח (Phase 3) — תובנות הסיכומים האחרונים של המשתמש.
   * השדה אופציונלי: אם אין סיכומים, ה-LLM יתעלם והפרומפט יישאר ב-2D מטריצה.
   *
   * 🚨 הוראה ל-LLM ב-system prompt: לא לציין את המילים "סיכום", "דו"ח",
   *    או לתת לזה להראות כתשובה רובוטית. הזיכרון הוא "תחושת חום" שאלמוג
   *    זוכר את המסע — לא ציטוט גולמי.
   */
  ai_memory?: AINotificationMemory;
}

/** תוצאה מסוכמת לכל מועמד אחרי שה-workflow רץ עליו. */
export type NotificationDispatchResult =
  | {
      userId: string;
      status: 'sent';
      notificationState: NotificationState;
      body: string;
    }
  | {
      userId: string;
      status: 'skipped';
      reason: string;
    }
  | {
      userId: string;
      status: 'failed';
      error: string;
    };
