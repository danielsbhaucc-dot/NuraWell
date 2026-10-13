import { describe, expect, it } from 'vitest';
import { DEFAULT_GUIDE_RULES, decideGuideOpen, isExplicitGuideRequest, parseGuideRules } from '../lib/guides/guide-rules';

const base = { rules: DEFAULT_GUIDE_RULES, signal: null, hasCompanionPick: false, activeGuideCount: 0, lastAiGrantAt: null };

describe('guide open rules', () => {
  it('explicit request opens', () => {
    expect(isExplicitGuideRequest('תפתח לי מדריך על שבת')).toBe(true);
    expect(decideGuideOpen({ ...base, message: 'אפשר מדריך לשבת?' })).toMatchObject({ open: true, via: 'explicit' });
  });
  it('the prod misfire ("water task hard, lower a level") does NOT open a guide', () => {
    expect(decideGuideOpen({ ...base, message: 'המשימה של המים ממש קשה לי השבוע, תוריד לי אותה רמה אחת בבקשה', signal: 'stress' })).toMatchObject({ open: false });
  });
  it('companion pick does not open on its own by default', () => {
    expect(decideGuideOpen({ ...base, message: 'תודה', hasCompanionPick: true })).toMatchObject({ open: false, reason: 'no_trigger' });
  });
  it('shabbat signal opens, respecting cooldown', () => {
    expect(decideGuideOpen({ ...base, message: 'השבת הייתה קשה', signal: 'shabbat' })).toMatchObject({ open: true, via: 'signal' });
    const recent = new Date(Date.now() - 3600_000).toISOString();
    expect(decideGuideOpen({ ...base, message: 'השבת הייתה קשה', signal: 'shabbat', lastAiGrantAt: recent })).toMatchObject({ open: false, reason: 'cooldown' });
  });
  it('admin can disable everything', () => {
    const rules = parseGuideRules({ enabled: false });
    expect(decideGuideOpen({ ...base, rules, message: 'תפתח לי מדריך' })).toMatchObject({ open: false, reason: 'disabled' });
  });
  it('max active guides', () => {
    expect(decideGuideOpen({ ...base, message: 'תפתח לי מדריך', activeGuideCount: 4 })).toMatchObject({ open: false, reason: 'max_active' });
  });
  it('garbage config falls back to defaults', () => {
    expect(parseGuideRules({ max_active_guides: 'x' })).toEqual(DEFAULT_GUIDE_RULES);
  });
});
