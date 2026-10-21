import { describe, expect, it } from 'vitest';
import {
  anonymizeNotifyText,
  applyAutoFixRules,
  categoryFromReason,
  countHits,
  parseLearnedRules,
  styleRulesPromptBlock,
  type StyleRule,
} from '../lib/notifications/quality-learning';

const rule = (p: Partial<StyleRule>): StyleRule => ({ id: 1, avoid: 'x', prefer: '', category: 'unnatural', hits: 2, active: true, auto_fix: false, ...p });

describe('notify quality learning', () => {
  it('anonymizes first name and PII patterns', () => {
    const t = anonymizeNotifyText('בוקר טוב דניאל, תתקשר 052-1234567', 'דניאל');
    expect(t).not.toContain('דניאל');
    expect(t).not.toContain('1234567');
    expect(t).toContain('[NAME]');
  });
  it('maps reasons to categories without free text', () => {
    expect(categoryFromReason('phrasing: wrong name in greeting: יוסי')).toBe('wrong_name');
    expect(categoryFromReason('phrasing: slash gender form; banned word: x')).toBe('slash_form');
    expect(categoryFromReason('truncated (finish_reason=length)')).toBe('structure');
  });
  it('builds a capped prompt block', () => {
    expect(styleRulesPromptBlock([])).toBeNull();
    const b = styleRulesPromptBlock(Array.from({ length: 20 }, (_, i) => rule({ id: i, avoid: `a${i}`, prefer: 'b' })))!;
    expect(b.split('\n').length).toBe(13);
    expect(b).toContain('לא "a0" → כן "b"');
  });
  it('applies only auto_fix rules on word boundaries', () => {
    const rules = [rule({ avoid: 'הזריקת המים', prefer: 'שתיית המים', auto_fix: true }), rule({ avoid: 'מה תופס אותך', prefer: 'מה עובר עליך' })];
    const r = applyAutoFixRules('תן לעצמך את הזריקת המים. מה תופס אותך?', rules);
    expect(r.text).toBe('תן לעצמך את שתיית המים. מה תופס אותך?');
    expect(r.applied).toHaveLength(1);
  });
  it('parses learned rules, drops name tokens, and counts real hits', () => {
    const rules = parseLearnedRules('```json\n{"rules":[{"avoid":"מה תופס אותך","prefer":"מה עובר עליך","category":"unnatural"},{"avoid":"היי [NAME]","prefer":"היי"}]}\n```');
    expect(rules).toEqual([{ avoid: 'מה תופס אותך', prefer: 'מה עובר עליך', category: 'unnatural' }]);
    expect(countHits('מה תופס אותך', ['א מה תופס אותך', 'ב מה תופס אותך?', 'א מה תופס אותך', 'אחר'])).toBe(2);
  });
});
