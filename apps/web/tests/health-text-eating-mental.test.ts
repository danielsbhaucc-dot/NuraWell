import { describe, expect, it } from 'vitest';
import { isHealthChatMessage } from '@/lib/privacy/health-chat-redaction';
import { isHealthText } from '@/lib/privacy/health-text';
import { gateTitleForConsent } from '@/lib/ai/chat-sessions/session-title';

const FLAG = [
  // the exact miss from prod (2026-10-20)
  'יש לי אכילה רגשית',
  'אכילה רגשית',
  'אכילה רגשית בערב',
  'ואכילה רגשית זה הדבר הכי קשה לי',
  'אני אוכל מלחץ',
  'אני אוכלת מתוך שעמום',
  'אני אוכלת כשאני לחוצה',
  'אני אוכל כשאני עצוב',
  'כשאני בודדה אני אוכלת בלי שליטה',
  'אני אוכל בלילות בסתר',
  'האוכל הוא הנחמה שלי, אוכל כנחמה',
  'יש לי התקפי אכילה',
  'היה לי התקף זלילה אתמול',
  'זללתי את כל המקרר',
  'אני לא מצליחה להפסיק לאכול',
  'אחרי שאני אוכלת אני מקיאה',
  'יש לי הפרעת אכילה',
  'הפרעות אכילה במשפחה',
  'אני בדיאטה',
  'התחלתי דיאטת קיטו',
  'אני סופרת קלוריות',
  'אני עושה צום לסירוגין',
  'אני רוצה להרזות',
  'אני מרגישה שמנה',
  'אני שונא את הגוף שלי',
  'יש לי דימוי גוף נמוך',
  'אני מתביישת בגוף שלי',
  'יש לי דיכאון',
  'אני בדיכאון כבר חודש',
  'יש לי חרדות',
  'היה לי התקף פאניקה',
  'אני הולך לפסיכולוג',
  'הפסיכיאטרית נתנה לי כדורים',
  'אני בטיפול רגשי',
  'יש לי הפרעת קשב',
  'אני לוקחת ריטלין',
  'אני סובל מנדודי שינה',
  'I have emotional eating',
  'stress eating every night',
  'I binge on weekends',
  "I'm on a diet",
  'my therapist said',
  'panic attacks',
];

const PASS = [
  'מה שלומך?',
  'היה לי יום עמוס בעבודה',
  'הלכתי עם הילדים לים',
  'קבעתי פגישה ב-10',
  'אני לחוץ מהעבודה',
  'בא לי לדבר על מוטיבציה',
  'אכלתי ארוחת ערב עם המשפחה',
  'איך אני בונה שגרת בוקר?',
  'אני שמח היום',
];

describe('health gate — eating behaviour, diets, body image, mental health', () => {
  it.each(FLAG)('flags %s', (t) => {
    expect(isHealthText(t)).toBe(true);
    expect(isHealthChatMessage(t)).toBe(true);
  });
  it.each(PASS)('passes %s', (t) => expect(isHealthChatMessage(t)).toBe(false));
});

describe('session titles are gated without consent', () => {
  it('drops a health title when consent is off', () => {
    expect(gateTitleForConsent('אכילה רגשית בערב', true)).toBeNull();
    expect(gateTitleForConsent('קושי עם דיאטה', true)).toBeNull();
  });
  it('keeps neutral titles and keeps everything when consent is on', () => {
    expect(gateTitleForConsent('תכנון שגרת בוקר', true)).toBe('תכנון שגרת בוקר');
    expect(gateTitleForConsent('אכילה רגשית בערב', false)).toBe('אכילה רגשית בערב');
  });
});

import { almogRedactionReply, HEALTH_CONSENT_OFF_PROMPT } from '@/lib/privacy/health-chat-redaction';

describe('Almog notice tone', () => {
  const bad = /\/|אסור|כללי השירות|לא יכול לגעת/;
  it('first notice in session: exact, explicit no-consent reason + how to consent', () => {
    expect(almogRedactionReply('male')).toBe(
      'אני שומע אותך, ואני כאן איתך 💛 את ההודעה מחקתי, כי מידע בריאותי אני לא שומר ללא הסכמה מפורשת ממך. זה נועד להגן על הפרטיות שלך, ואם תרצה, אפשר לאשר בהגדרות או פשוט לבקש ממני. בינתיים, ספר לי מה הולך טוב השבוע בתוכנית שלך?'
    );
    const fem = almogRedactionReply('female', { variant: 0 });
    expect(fem).toContain('ללא הסכמה מפורשת');
    expect(fem).toContain('תרצי');
    expect(fem).toContain('ספרי לי');
    const neu = almogRedactionReply(null);
    expect(neu).toContain('ללא הסכמה מפורשת');
    expect(neu).not.toMatch(/תרצה|תרצי|ספר לי|ספרי/);
    for (const r of [fem, neu]) expect(r).not.toMatch(bad);
  });
  it('subsequent notices: no consent mention, warm, short, plan/habits, distinct, gendered', () => {
    for (const gd of ['male', 'female', null]) {
      const subs = [1, 2, 3].map((v) => almogRedactionReply(gd, { variant: v }));
      expect(new Set(subs).size).toBe(3);
      for (const r of subs) {
        expect(r).toMatch(/נמחק|מחקתי/);
        expect(r).not.toMatch(/הסכמה|הגדרות|לאשר/);
        expect(r).not.toMatch(bad);
        expect(r).toMatch(/תוכנית|הרגל|משימה/);
        expect(r.length).toBeLessThan(130);
      }
      expect(almogRedactionReply(gd, { variant: 4 })).toBe(subs[0]);
    }
    expect(almogRedactionReply('female', { variant: 1 })).toContain('בואי');
    expect(almogRedactionReply('male', { variant: 1 })).toContain('בוא נמשיך');
    expect(almogRedactionReply('female', { variant: 2 })).toContain('ספרי לי');
  });
  it('prompt block: no unprompted consent, answers meta-questions, redirects to plan', () => {
    expect(HEALTH_CONSENT_OFF_PROMPT).toContain('מי קבע');
    expect(HEALTH_CONSENT_OFF_PROMPT).toContain('אפס לחץ');
    expect(HEALTH_CONSENT_OFF_PROMPT).toContain('התוכנית');
    expect(HEALTH_CONSENT_OFF_PROMPT).not.toContain('"בלי הסכמה אני לא יכול לגעת בנושא הזה" —');
  });
});

describe('consent meta-questions are not health', () => {
  it.each(['הסכמה של מה?', 'כל דבר אתה לא יכול לדבר? זה מעיק', 'למה? למה אסור?', 'מי קבע?', 'אבל אני לא רוצה למסור מידע רוצה לקבל מידע'])(
    'passes %s',
    (t) => expect(isHealthChatMessage(t)).toBe(false)
  );
  it('flags the request for info on emotional eating', () => {
    expect(isHealthChatMessage('זו חוצפה. נא למסור אליי מידע על אכילה רגשית')).toBe(true);
  });
});
