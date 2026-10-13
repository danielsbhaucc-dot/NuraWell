import { describe, expect, it } from 'vitest';
import { createPiiShield } from '@/lib/ai/privacy/pii-shield';
import { ibanValid, israeliIdValid, luhnValid } from '@/lib/ai/privacy/pii-patterns';

const sh = (seed = {}) => createPiiShield(seed);
const roundtrip = (text: string, seed = {}) => {
  const s = sh(seed);
  const t = s.tokenizeText(text);
  return { t, back: s.detokenizeText(t) };
};

describe('pii validators', () => {
  it('israeli id checksum', () => {
    expect(israeliIdValid('000000018')).toBe(true);
    expect(israeliIdValid('123456782')).toBe(true);
    expect(israeliIdValid('123456789')).toBe(false);
  });
  it('luhn', () => {
    expect(luhnValid('4580 1234 5678 9010')).toBe(false);
    expect(luhnValid('4111 1111 1111 1111')).toBe(true);
  });
  it('iban', () => {
    expect(ibanValid('IL62 0108 0000 0009 9999 999')).toBe(true);
    expect(ibanValid('GB82 WEST 1234 5698 7654 32')).toBe(true);
    expect(ibanValid('IL62 0108 0000 0009 9999 998')).toBe(false);
  });
});

describe('pii detection + restore', () => {
  const cases: [string, string, string][] = [
    ['phone mobile', 'תתקשר 050-123-4567 בבקשה', '[[USER_PHONE]]'],
    ['phone +972', 'my number +972 52 765 4321 ok', '[[USER_PHONE]]'],
    ['phone landline', 'בבית 03-6123456', '[[USER_PHONE]]'],
    ['phone parens', 'טלפון (02) 6543210', '[[USER_PHONE]]'],
    ['phone 1-800', 'מוקד 1-800-222-333', '[[USER_PHONE]]'],
    ['phone intl', 'call +1 415 555 2671', '[[USER_PHONE]]'],
    ['email', 'Mail: Dan.Cohen+x@gmail.co.il thanks', '[[USER_EMAIL]]'],
    ['id', 'ת"ז שלי 123456782', '[[USER_ID]]'],
    ['id dash', 'תעודת זהות 12345678-2', '[[USER_ID]]'],
    ['card', 'הכרטיס 4111 1111 1111 1111 בתוקף', '[[USER_CARD]]'],
    ['card dashes', 'card 5555-5555-5555-4444', '[[USER_CARD]]'],
    ['iban', 'IBAN: IL62 0108 0000 0009 9999 999', '[[USER_IBAN]]'],
    ['bank account', 'מספר חשבון 12-345-678901', '[[USER_BANK_ACCOUNT]]'],
    ['account en', 'account number 123456789', '[[USER_BANK_ACCOUNT]]'],
    ['address he', 'אני גר ברחוב הרצל 15, תל אביב', '[[USER_ADDRESS]]'],
    ['address he short', "בשד' רוטשילד 22 דירה 4", '[[USER_ADDRESS]]'],
    ['address en', 'I live at 221 Baker Street now', '[[USER_ADDRESS]]'],
    ['birth dmy', 'נולדתי ב-12/03/1985', '[[USER_BIRTHDATE]]'],
    ['birth heb', 'נולדתי 5 במרץ 1990', '[[USER_BIRTHDATE]]'],
    ['birth en', 'born March 5, 1990', '[[USER_BIRTHDATE]]'],
    ['birth iso', 'dob 1979-11-02', '[[USER_BIRTHDATE]]'],
    ['ipv4', 'ip 192.168.10.25 blocked', '[[USER_IP]]'],
    ['ipv6', 'ip 2001:0db8:85a3:0000:0000:8a2e:0370:7334', '[[USER_IP]]'],
    ['passport he', 'מספר דרכון 23456789', '[[USER_PASSPORT]]'],
    ['passport en', 'passport no. X1234567', '[[USER_PASSPORT]]'],
    ['name he', 'קוראים לי יעלי ואני רוצה לרדת', '[[PERSON]]'],
    ['name he relative', 'יש לי חברה בשם שירלי שמציקה', '[[PERSON]]'],
    ['name he colon', 'שמי: אורנה', '[[PERSON]]'],
    ['name en', 'Hi, my name is Rachel Green', '[[PERSON]]'],
  ];
  for (const [label, text, ph] of cases) {
    it(`${label}: tokenized and restored`, () => {
      const { t, back } = roundtrip(text);
      expect(t).toContain(ph);
      expect(back).toBe(text);
    });
  }

  it('seeded names (first/last, Hebrew/English) + contacts', () => {
    const seed = { full_name: 'Dana Levi', known_person_names: ['רונית', 'Moshe Cohen'] };
    const { t, back } = roundtrip('Dana and Levi, רונית ו-Moshe Cohen; danger and Danabol', seed);
    expect(t).not.toMatch(/\bDana\b|\bLevi\b|רונית|Moshe Cohen/);
    expect(t).toContain('danger');
    expect(t).toContain('Danabol');
    expect(back).toBe('Dana and Levi, רונית ו-Moshe Cohen; danger and Danabol');
  });
});

describe('no over-redaction of food/health/plan text', () => {
  const safe = [
    'תנועה של 30 דקות ביום, נועה',
    'אכלתי 150 גרם חזה עוף ו-2 כפות טחינה, 450 קלוריות',
    'המשקל ירד מ-82.5 ל-79.3 קילו',
    'נפגש ב-15/10/2026 בשעה 18:30',
    'שתיתי 2.5 ליטר מים, דופק 72, לחץ דם 120/80',
    'הצעדים היום: 12,345 צעדים, 8000 יעד',
    'סוכר בצום 95, HbA1c 5.6',
    'קוראים לזה קטניות',
    'שמי שמח היום אחרי האימון',
    'version 1.2.3.4 of the app',
    'ארוחת ערב ב-20:00, 3 ביצים',
    'my name is not important',
    'מחיר 1,299 ש"ח',
  ];
  for (const text of safe) {
    it(`unchanged: ${text}`, () => {
      const seed = { full_name: 'נועה כהן' };
      const out = sh(seed).tokenizeText(text);
      if (text.includes(', נועה')) {
        expect(out.startsWith('תנועה של 30 דקות ביום, ')).toBe(true);
        expect(out).not.toContain(', נועה');
      } else {
        expect(out).toBe(text);
      }
    });
  }
});

describe('ids that are not PII', () => {
  it('uuids and hashes untouched', () => {
    const s = 'id 6eb0501234567-43b3-badd-0265d6925abc and 550e8400-e29b-41d4-a716-446655440000';
    expect(createPiiShield({}).tokenizeText(s)).toBe(s);
  });
  it('hebrew prefix with hyphen still detected', () => {
    expect(createPiiShield({}).tokenizeText('תתקשר ל-052-7654321')).toContain('[[USER_PHONE]]');
  });
});
