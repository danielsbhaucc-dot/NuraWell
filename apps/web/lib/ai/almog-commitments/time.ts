/**
 * עזרי זמן לשעון ישראל (DST-aware) עבור התחייבויות אלמוג.
 *
 * חוק ברזל: *לא* מבקשים ממודל ה-LLM לחשב UTC. מודלים זולים טועים בהמרת אזורי
 * זמן (זו הסיבה ש"תזכיר לי ב-00:30" נקבע ל-03:30). לכן המודל מחזיר שעון-קיר
 * ישראלי כפשוטו ("YYYY-MM-DD HH:MM"), וההמרה ל-UTC נעשית כאן באופן דטרמיניסטי.
 */

const IL_TZ = 'Asia/Jerusalem';

/** ההיסט (ms) של שעון ישראל ביחס ל-UTC ברגע נתון — מודע ל-DST. */
function israelOffsetMs(at: Date): number {
  const il = new Date(at.toLocaleString('en-US', { timeZone: IL_TZ }));
  const utc = new Date(at.toLocaleString('en-US', { timeZone: 'UTC' }));
  return il.getTime() - utc.getTime();
}

/** רכיבי התאריך/שעה בישראל ברגע נתון. */
export interface IsraelParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number; // 0-59
}

/** מפרק רגע נתון לרכיבי שעון ישראל. */
export function israelParts(at: Date): IsraelParts {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: IL_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0');
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour') % 24,
    minute: get('minute'),
  };
}

/** שעת ישראל הנוכחית (0–23). */
export function israelHour(now: Date): number {
  return israelParts(now).hour;
}

/**
 * ממיר שעון-קיר ישראלי מוחלט (y/m/d/h/min) ל-UTC ISO, עם תמיכת DST.
 * החודש הוא 1–12 (לא אינדקס JS).
 */
export function israelWallClockToUtcIso(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number
): string {
  const guessUtc = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const offset = israelOffsetMs(guessUtc);
  return new Date(guessUtc.getTime() - offset).toISOString();
}

/** עכשיו + addDays (בלוח ישראל), בשעה hour:minute ישראלי, כ-UTC ISO. */
export function israelDayOffsetToUtcIso(
  now: Date,
  addDays: number,
  hour: number,
  minute: number
): string {
  const target = new Date(now.getTime() + addDays * 86_400_000);
  const p = israelParts(target);
  return israelWallClockToUtcIso(p.year, p.month, p.day, hour, minute);
}

const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/;

/**
 * מפרק מחרוזת שעון-קיר ישראלי ("YYYY-MM-DD HH:MM" או עם T) ומחזיר רכיבים, או
 * null אם הפורמט לא תקין/לא הגיוני.
 */
export function parseIsraelLocal(local: string): IsraelParts | null {
  const m = LOCAL_RE.exec(local.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) {
    return null;
  }
  return { year, month, day, hour, minute };
}

/**
 * תיקון "אחרי חצות": אם עכשיו עמוק בלילה (00:00–04:59 שעון ישראל) והתזכורת
 * חושבה ליום *שאחרי* בשעת בוקר (05:00–11:59), המשתמש כמעט תמיד התכוון לבוקר
 * *הקרוב* (אותו תאריך של עכשיו). דוגמה: עכשיו 15/06 00:30, "מחר ב-7" → המודל
 * נותן 16/06 07:00, ואנחנו מחזירים ל-15/06 07:00. מתקנים רק אם התוצאה עדיין
 * עתידית. מחזיר רכיבים (אולי מתוקנים).
 */
export function correctLateNightMorning(parts: IsraelParts, now: Date): IsraelParts {
  const nowP = israelParts(now);
  if (nowP.hour >= 5) return parts;
  if (parts.hour < 5 || parts.hour >= 12) return parts;

  // האם parts הוא יום אחד אחרי "היום" בישראל?
  const todayUtc = Date.UTC(nowP.year, nowP.month - 1, nowP.day);
  const partsUtc = Date.UTC(parts.year, parts.month - 1, parts.day);
  if (partsUtc - todayUtc !== 86_400_000) return parts;

  const shifted: IsraelParts = {
    year: nowP.year,
    month: nowP.month,
    day: nowP.day,
    hour: parts.hour,
    minute: parts.minute,
  };
  // לוודא שהזמן המתוקן עדיין עתידי (לפחות דקה קדימה).
  const shiftedIso = israelWallClockToUtcIso(
    shifted.year,
    shifted.month,
    shifted.day,
    shifted.hour,
    shifted.minute
  );
  if (new Date(shiftedIso).getTime() <= now.getTime() + 60_000) return parts;
  return shifted;
}

/**
 * ממיר מחרוזת שעון-קיר ישראלי ל-UTC ISO, כולל תיקון "אחרי חצות". מחזיר null אם
 * הפורמט לא תקין.
 */
export function israelLocalToUtcIso(local: string, now: Date): string | null {
  const parsed = parseIsraelLocal(local);
  if (!parsed) return null;
  const corrected = correctLateNightMorning(parsed, now);
  return israelWallClockToUtcIso(
    corrected.year,
    corrected.month,
    corrected.day,
    corrected.hour,
    corrected.minute
  );
}
