/**
 * Notification State — ה"מכונת מצבים" של מנוע ההתראות.
 *
 * נגזרת דטרמיניסטית מתוך:
 *   • timeOfDay        — איזה קרון הופעל (08:00 / 13:00 / 20:00).
 *   • consecutiveMissedDays — מספר ימים *רצופים* שהמשתמש *לא* השלים את המשימה
 *                              (לא כולל היום הנוכחי).
 *
 * החישוב נעשה ב-`deriveNotificationState` (קובץ נפרד) — הקובץ הזה
 * הוא טיפוסים בלבד כדי ש-server / workflow / UI יוכלו לייבא בלי side-effects.
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
}

/**
 * Payload שמועבר ל-OpenAI כתוכן JSON בתוך user message,
 * אחרי שה-system prompt קבע את "אישיות אלמוג" (chat coach).
 *
 * ה-AI מחזיר טקסט קצר (max 15 מילים) — לא JSON, רק push body.
 */
export interface AINotificationPayload {
  firstName: string;
  taskName: string;
  notificationState: NotificationState;
  /** Hint נוסף — לפעמים מועיל למודל לדעת את ה-slot של היום. */
  timeOfDay: TimeOfDay;
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
