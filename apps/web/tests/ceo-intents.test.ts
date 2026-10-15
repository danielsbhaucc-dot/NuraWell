import { describe, expect, it } from 'vitest';
import { detectDemoIntent } from '@/lib/ceo/intents';

describe('demo-link intent', () => {
  it.each([
    ['תפתח גישה לאלכס עם קישור דמו', 'אלכס', 24],
    ['תן לאלכס גישה', 'אלכס', 24],
    ['תעשה לינק דמו לדנה ליומיים', 'דנה', 48],
    ['גדעון, תכין דמו בשביל יוסי לשבוע', 'יוסי', 168],
    ['אחי תביא לי קישור דמו לרוני', 'רוני', 24],
    ['צור קישור דמו', undefined, 24],
    ['שלח לי לינק דמו לשלומי ל-3 שעות', 'שלומי', 24],
    ['תפתח לשרית גישת דמו ל 5 ימים', 'שרית', 120],
    ['אפשר דמו למיכל?', 'מיכל', 24],
  ])('%s', (text, name, hours) => {
    const r = detectDemoIntent(text);
    expect(r).not.toBeNull();
    expect(r?.guest_name).toBe(name);
    if (hours !== 24 || !/\d\s*שעות/.test(text)) expect(r?.hours).toBe(hours);
  });

  it.each([
    'מה המצב?',
    'כמה קישורי דמו פעילים יש?',
    'תבטל את הדמו של אלכס',
    'למה אלכס לא נכנס לדמו?',
    'תן לי סיכום של אתמול',
    'תשלח התראה לדנה',
  ])('not a create intent: %s', (text) => {
    expect(detectDemoIntent(text)).toBeNull();
  });
});
