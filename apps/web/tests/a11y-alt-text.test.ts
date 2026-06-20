import { describe, expect, it } from 'vitest';
import { mediaAltText, stationCoverAlt, stockPreviewAlt } from '@/lib/a11y/alt-text';

describe('alt-text helpers', () => {
  it('mediaAltText prefers title then name then fallback', () => {
    expect(mediaAltText({ title: '  כותרת ', fallback: 'fb' })).toBe('כותרת');
    expect(mediaAltText({ name: 'שם', fallback: 'fb' })).toBe('שם');
    expect(mediaAltText({ fallback: 'fb' })).toBe('fb');
  });

  it('stationCoverAlt includes title', () => {
    expect(stationCoverAlt('התחלה', 0)).toBe('תמונת תחנה 1: התחלה');
  });

  it('stockPreviewAlt includes photographer when present', () => {
    expect(stockPreviewAlt('שקיעה', 'Jane')).toBe('שקיעה — Jane');
  });
});
