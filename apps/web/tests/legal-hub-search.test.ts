import { describe, expect, it } from 'vitest';
import { expand, fuzzyScore, normalize, parseDates } from '@/lib/legal/hub/search-core';
import { scoreMatch } from '@/lib/legal/hub/match';

const now = new Date('2026-10-20T12:00:00Z');
describe('hub search', () => {
  it('normalizes Hebrew finals and niqqud', () => { expect(normalize('שָׁלוֹם')).toBe('שלומ'); });
  it('parses relative and named dates', () => {
    expect(parseDates('השיר בחודש שעבר', now).range).toMatchObject({ from: '2026-09-01', to: '2026-09-30' });
    expect(parseDates('ספטמבר', now).range).toMatchObject({ from: '2026-09-01' });
    expect(parseDates('קבלה מדצמבר', now).range).toMatchObject({ from: '2025-12-01' });
    expect(parseDates('receipts october 2025', now).range).toMatchObject({ from: '2025-10-01', to: '2025-10-31' });
    const s = parseDates('השיר מהקיץ על הריצה', now);
    expect(s.range).toMatchObject({ from: '2026-06-01', to: '2026-08-31' });
    expect(s.rest).toContain('ריצה');
  });
  it('expands bilingual synonyms', () => { expect(expand(['שיר'])).toContain('music'); expect(expand(['receipt'])).toContain('קבלה'); });
  it('tolerates one typo', () => { expect(fuzzyScore('morning breathing song', ['mornin'])).toBeGreaterThan(0.5); expect(fuzzyScore('בוקר חדש', ['בוקק'])).toBeGreaterThan(0.5); });
});
describe('receipt match', () => {
  it('scores vendor + period + verified high', () => {
    const r = scoreMatch({ asset_key: 'a', source_type: 'ai_music', provenance: { generator: 'suno', created_on: '2026-10-12' } },
      { id: 'r', vendor: 'suno', plan: 'Pro', amount: 10, currency: 'USD', receipt_date: '2026-10-03', period_start: '2026-10-03', period_end: '2026-11-02', trust: 'verified', subject: null });
    expect(r.confidence).toBeGreaterThanOrEqual(90);
  });
  it('rejects other vendors', () => {
    expect(scoreMatch({ asset_key: 'a', source_type: 'ai_music', provenance: { generator: 'suno', created_on: '2026-10-12' } },
      { id: 'r', vendor: 'midjourney' as never, plan: null, amount: null, currency: null, receipt_date: '2026-10-12', period_start: null, period_end: null, trust: 'verified', subject: null }).confidence).toBe(0);
  });
});
