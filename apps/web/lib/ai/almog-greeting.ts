/**
 * almog-greeting.ts
 * -----------------
 * מחולל בועת הברכה של אלמוג בראש מסך הבית. צד-לקוח, מיידי (בלי קריאת AI),
 * אבל חכם ולא גנרי: הניסוח מתחלף יומית לפי seed (תאריך + שם + מצב), מותאם
 * לחלק היום ומבוסס על אותם עקרונות פסיכולוגיים של מנוע המומנטום.
 */

import { normalizeHebrewDashes } from '../text/hebrew-dashes';
import { partOfDayInIsrael, pickDaily, type PartOfDay } from './momentum-psychology';

export type GreetingTaskState = 'loading' | 'fresh' | 'pending' | 'done';

export type AlmogGreeting = {
  /** טקסט פתיחה רגיל */
  lead: string;
  /** החלק המודגש (זהב) — ההזמנה/השאלה */
  highlight: string;
};

/** מפתח תאריך בלוח ירושלים — seed יומי יציב. */
function israelDateKey(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** פתיחות חמות לפי חלק היום — תחושת נוכחות אנושית. */
const LEAD_FRESH: Record<PartOfDay, readonly string[]> = {
  morning: ['שמח שאתה כאן 🌿', 'בוקר טוב, טוב לראות אותך 🌿', 'יום חדש, ואני כאן 🌿'],
  noon: ['טוב שקפצת 🌿', 'שמח שאתה כאן 🌿', 'אמצע יום, רגע לעצמך 🌿'],
  evening: ['טוב לראות אותך הערב 🌿', 'ערב נעים, שמח שאתה כאן 🌿', 'רגע שקט בערב 🌿'],
  night: ['שמח שקפצת לרגע 🌿', 'טוב לראות אותך 🌿', 'גם בלילה אני כאן 🌿'],
};

/** הזמנות פתוחות (תמיכה באוטונומיה) — בלי לחץ, בחירה אצל המשתמש. */
const HIGHLIGHT_FRESH: readonly string[] = [
  'כשנוח לך, תכתוב לי במשפט מה הכי חשוב היום.',
  'בלי לחץ, רק ספר לי מה על הראש שלך עכשיו.',
  'מה הכי מתאים לך להתחיל ממנו היום?',
  'ספר לי במשפט מה היית רוצה שיקרה היום.',
];

/** סגירות לאחר השלמה — חיזוק זהות ועקביות (Progress Principle). */
const HIGHLIGHT_DONE: readonly string[] = [
  'מה הכי מרגיש לך עכשיו?',
  'בדיוק ככה נבנית עקביות. מה הלאה?',
  'יום שאפשר להיות גאה בו. איך אתה מרגיש?',
  'סגרת יפה. מה מתחשק לך עכשיו?',
];

/** הזמנות כשיש משימות פתוחות — צעד זעיר, בלי הטפה (Tiny Habits). */
const HIGHLIGHT_PENDING: readonly string[] = [
  'ספר לי בצ׳אט כשעשית, בלי לחפש כפתורים.',
  'אפילו אחת מהן מזיזה את המחט. ספר לי כשעשית.',
  'לא חייבים הכל, אחת קטנה מספיקה כדי להרגיש תנועה.',
  'בקצב שלך. ספר לי בצ׳אט כשסימנת אחת.',
];

/**
 * בונה את הברכה היומית. דטרמיניסטי לאורך היום (לא מרצד) אך מגוון בין הימים.
 */
export function buildAlmogGreeting(params: {
  firstName: string;
  taskState: GreetingTaskState;
  pendingCount?: number;
  now?: Date;
}): AlmogGreeting {
  const { firstName, taskState, pendingCount = 0 } = params;
  const now = params.now ?? new Date();
  const part = partOfDayInIsrael(now);
  const name = firstName?.trim() ? `${firstName.trim()}, ` : '';
  const seed = `${israelDateKey(now)}:${firstName || 'x'}:${taskState}`;

  if (taskState === 'loading') {
    return { lead: 'רגע, אני מסתכל על המסע שלך…', highlight: '' };
  }

  if (taskState === 'pending') {
    const count =
      pendingCount === 1 ? 'משימה אחת שקיבלת' : `${pendingCount} משימות שקיבלת`;
    return {
      lead: normalizeHebrewDashes(`${name}יש לך ${count} ועדיין לא סגרת.`),
      highlight: normalizeHebrewDashes(pickDaily(HIGHLIGHT_PENDING, seed)),
    };
  }

  if (taskState === 'done') {
    return {
      lead: normalizeHebrewDashes(`${name}סגרת את מה שהתחייבת אליו היום ✦`),
      highlight: normalizeHebrewDashes(pickDaily(HIGHLIGHT_DONE, seed)),
    };
  }

  // fresh — משתמש בלי משימות פעילות היום
  return {
    lead: normalizeHebrewDashes(`${name}${pickDaily(LEAD_FRESH[part], seed)}`),
    highlight: normalizeHebrewDashes(pickDaily(HIGHLIGHT_FRESH, seed)),
  };
}
