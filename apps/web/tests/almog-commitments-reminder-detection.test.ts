import { describe, expect, it } from 'vitest';

import { detectExplicitReminderPromise } from '../lib/ai/almog-commitments/extract-commitments';

/**
 * רשת הביטחון יוצרת תזכורת רק כשאלמוג *התחייב בעצמו* להזכיר. הבדיקות כאן נועדו
 * למנוע רגרסיה של הבאג שבו אזכור של המילה "תזכורת" או שאלה ("מתי אתה רוצה
 * שאזכיר לך?") יצרו תזכורות מזויפות.
 */
describe('detectExplicitReminderPromise', () => {
  it('מזהה התחייבות מפורשת בגוף ראשון של אלמוג', () => {
    expect(detectExplicitReminderPromise('סבבה, אזכיר לך לשתות מים ב-20:00')).toBe(true);
    expect(detectExplicitReminderPromise('אני אזכיר לך מחר בבוקר')).toBe(true);
    expect(detectExplicitReminderPromise('אשלח לך תזכורת בערב')).toBe(true);
    expect(detectExplicitReminderPromise('נזכיר לך על ההליכה')).toBe(true);
    expect(detectExplicitReminderPromise('קבעתי לך תזכורת ל-7')).toBe(true);
  });

  it('לא מזהה את שם-העצם "תזכורת" לבדו (אמפתיה/הסבר)', () => {
    expect(
      detectExplicitReminderPromise(
        'אני לגמרי מבין למה זה מפריע – תזכורת שמגיעה בזמן הלא נכון זה כמו צלצול באמצע מחשבה, פשוט מבלבל ומרגיז.'
      )
    ).toBe(false);
    expect(detectExplicitReminderPromise('תזכורת היא כלי שעוזר לזכור משימות')).toBe(false);
  });

  it('לא מזהה שאלה/בקשה על מתי להזכיר', () => {
    expect(
      detectExplicitReminderPromise(
        'בוא נעשה סדר עכשיו: אם יש משהו ספציפי, תגיד לי בדיוק מתי אתה רוצה שאזכיר לך, ואני אדאג שזה יקרה כמו שצריך.'
      )
    ).toBe(false);
    expect(detectExplicitReminderPromise('מתי אתה רוצה שאזכיר לך?')).toBe(false);
    expect(detectExplicitReminderPromise('רוצה שאזכיר לך על זה מחר?')).toBe(false);
    // ש-prefixed verb forms (subordinate clauses) are not commitments
    expect(detectExplicitReminderPromise('אמרתי שאזכיר לך אבל עוד לא בטוח')).toBe(false);
    expect(detectExplicitReminderPromise('הוא ביקש שאשלח לך הודעה')).toBe(false);
  });

  it('לא מזהה שלילה', () => {
    expect(detectExplicitReminderPromise('אל תדאג, לא אזכיר לך על זה שוב')).toBe(false);
    expect(detectExplicitReminderPromise('נמשיך בלי תזכורת הפעם')).toBe(false);
  });

  it('מזהה "אל תדאג" + התחייבות כהבטחת תזכורת (לא כשלילה)', () => {
    expect(detectExplicitReminderPromise('אל תדאג, אזכיר לך מחר בבוקר')).toBe(true);
    expect(detectExplicitReminderPromise('אל תדאג אני אזכיר לך בערב 🙂')).toBe(true);
  });

  it('מזהה התחייבות במשפט נפרד גם אם יש שאלה במשפט אחר', () => {
    expect(
      detectExplicitReminderPromise(
        'רוצה שאזכיר לך מחר? סבבה, אזכיר לך מחר ב-8 בבוקר.'
      )
    ).toBe(true);
  });

  it('לא מזהה שיחה רגילה ללא הבטחה', () => {
    expect(detectExplicitReminderPromise('מה שלומך היום? ספר לי איך הלך')).toBe(false);
    expect(detectExplicitReminderPromise('כל הכבוד על ההתמדה!')).toBe(false);
  });
});
