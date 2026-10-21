import { describe, expect, it } from 'vitest';
import { genderFromInstruction, lintNotifyHebrew } from '../lib/notifications/notify-hebrew-lint';
import { validateNotifyText } from '../lib/notifications/validate-notify-text';
import { maskName, unmaskName } from '../lib/notifications/notify-qc';

describe('lintNotifyHebrew — fixes', () => {
  it('collapses elongations and doubled greeting letters', () => {
    expect(lintNotifyHebrew('בוקררר טובבב 😄 איך הולך?').text).toBe('בוקר טוב 😄 איך הולך?');
    expect(lintNotifyHebrew('בוקר אורר ☀️ איך הולך?').text).toBe('בוקר אור ☀️ איך הולך?');
    expect(lintNotifyHebrew('וואלה דניאללל 💪 איך?', { firstName: 'דניאל' }).text).toBe('וואלה דניאל 💪 איך?');
  });
  it('fixes "שני כוסות" and "!!"', () => {
    const r = lintNotifyHebrew('וואלה!! איך אתה על שני כוסות המים?');
    expect(r.text).toBe('וואלה! איך אתה על שתי כוסות המים?');
    expect(r.fixes).toEqual(expect.arrayContaining(['multi_punct', 'number_gender']));
  });
  it('keeps correct text untouched', () => {
    const t = 'ערב טוב 🌙 איך הלך היום עם שתי כוסות המים לפני הארוחה?';
    expect(lintNotifyHebrew(t, { firstName: 'דניאל', gender: 'male' })).toEqual({ text: t, fixes: [], issues: [] });
  });
});

describe('lintNotifyHebrew — issues', () => {
  it('flags a greeting with another person\'s name', () => {
    expect(lintNotifyHebrew('אהלן יוסי! צהריים טובים 🌤️', { firstName: 'דניאל' }).issues[0]).toMatch(/wrong name/);
    expect(lintNotifyHebrew('בוקר אור יובל ☀️ איך מתקדם?', { firstName: 'דניאל' }).issues[0]).toMatch(/wrong name/);
    expect(lintNotifyHebrew('אהלן יוסי! מה קורה?', { firstName: 'יוסי' }).issues).toEqual([]);
  });
  it('flags slash forms, banned words and gendered slang mismatch', () => {
    expect(lintNotifyHebrew('את/ה מוכן להתחיל?').issues).toContain('slash gender form');
    expect(lintNotifyHebrew('מתגעגע לחברותא שלנו').issues.join()).toMatch(/banned/);
    expect(lintNotifyHebrew('וואלה אחי, איך הולך?', { gender: 'female' }).issues.join()).toMatch(/male slang/);
    expect(lintNotifyHebrew('וואלה אחי, איך הולך?', { gender: 'male' }).issues).toEqual([]);
    expect(lintNotifyHebrew('שתית את השתיים של המים?').issues.join()).toMatch(/unnatural/);
  });
  it('validateNotifyText rejects phrasing defects so generation retries', () => {
    const r = validateNotifyText('אהלן יוסי! צהריים טובים 🌤️ איך הולך עם המים היום?', { firstName: 'דניאל' });
    expect(r.ok).toBe(false);
    const ok = validateNotifyText('בוקר אורר ☀️ איך הולך עם שני כוסות המים היום?!!', { firstName: 'דניאל' });
    expect(ok).toMatchObject({ ok: true, text: 'בוקר אור ☀️ איך הולך עם שתי כוסות המים היום?' });
  });
});

describe('notify qc helpers', () => {
  it('masks and restores the first name', () => {
    const m = maskName('היי דניאל, איך הולך דניאל?', 'דניאל');
    expect(m).toBe('היי [NAME], איך הולך [NAME]?');
    expect(unmaskName(m, 'דניאל')).toBe('היי דניאל, איך הולך דניאל?');
  });
  it('maps gender instruction', () => {
    expect(genderFromInstruction('המשתמשת נקבה — ...')).toBe('female');
    expect(genderFromInstruction('המשתמש זכר')).toBe('male');
    expect(genderFromInstruction('')).toBe('other');
  });
});
