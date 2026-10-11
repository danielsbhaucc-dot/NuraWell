import { describe, expect, it } from 'vitest';
import { truncateNotifyText, validateNotifyText } from '../lib/notifications/validate-notify-text';

const good = 'היי, ראיתי שהיום היה עמוס. מה צעד אחד קטן שאתה יכול לעשות עכשיו? 💪';

describe('validateNotifyText', () => {
  it('accepts natural Hebrew', () => {
    const r = validateNotifyText(good);
    expect(r).toEqual({ ok: true, text: good });
  });
  it('rejects truncated generations', () => {
    expect(validateNotifyText(good, { finishReason: 'length' }).ok).toBe(false);
  });
  it('strips think blocks and quotes', () => {
    const r = validateNotifyText(`<think>We need to write</think>"${good}"`);
    expect(r).toEqual({ ok: true, text: good });
  });
  it('rejects reasoning leakage / English', () => {
    expect(validateNotifyText('We need to respond in Hebrew to the user about habits today').ok).toBe(false);
    expect(validateNotifyText('היי! let me think about the analysis of your habits ok').ok).toBe(false);
  });
  it('rejects foreign scripts, repetition, garbled words', () => {
    expect(validateNotifyText('היי מה שלומך היום 你好 חבר').ok).toBe(false);
    expect(validateNotifyText('היי היי היי היי היי מה קורה איתך').ok).toBe(false);
    expect(validateNotifyText('היי אחי אבגדהוזחטיכלמנסעפצקרשת מה נשמע').ok).toBe(false);
  });
  it('rejects JSON output and placeholders', () => {
    expect(validateNotifyText('{"body":"היי מה קורה איתך היום"}').ok).toBe(false);
    expect(validateNotifyText('היי [FIRST_NAME], איך עבר היום שלך?').ok).toBe(false);
  });
  it('rejects Almog feminine self-reference, allows feminine addressing', () => {
    expect(validateNotifyText('אני מבינה שהיום היה קשה, בואי ננסה צעד קטן').ok).toBe(false);
    expect(validateNotifyText('אני מבין שהיום היה קשה, בואי ננסה צעד קטן').ok).toBe(true);
  });
  it('allows brand words', () => {
    expect(validateNotifyText('היי, ב-NuraWell מחכה לך צעד קטן להיום 🌿').ok).toBe(true);
  });
});

describe('truncateNotifyText', () => {
  it('cuts at last full sentence when possible', () => {
    const t = 'משפט ראשון קצר וטוב. משפט שני ארוך מאוד שלא ייכנס בכלל למגבלה שהגדרנו כאן';
    expect(truncateNotifyText(t, 40)).toBe('משפט ראשון קצר וטוב.');
  });
  it('never cuts mid-word', () => {
    const out = truncateNotifyText('מילה '.repeat(30), 23);
    expect(out.endsWith('…')).toBe(true);
    expect(out.replace('…', '').trim().split(' ').every((w) => w === 'מילה')).toBe(true);
  });
});
