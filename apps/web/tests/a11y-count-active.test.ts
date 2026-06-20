import { describe, expect, it } from 'vitest';
import { countActiveAccessibilityPreferences } from '@/lib/a11y/count-active-preferences';
import { parseAccessibilityPreferences } from '@/lib/a11y/storage';
import { DEFAULT_ACCESSIBILITY_PREFERENCES } from '@/lib/a11y/types';

describe('countActiveAccessibilityPreferences', () => {
  it('returns zero for defaults', () => {
    expect(countActiveAccessibilityPreferences(DEFAULT_ACCESSIBILITY_PREFERENCES)).toBe(0);
  });

  it('counts multiple active toggles', () => {
    expect(
      countActiveAccessibilityPreferences({
        ...DEFAULT_ACCESSIBILITY_PREFERENCES,
        fontScale: 'lg',
        highContrast: true,
        muteMedia: true,
      }),
    ).toBe(3);
  });
});

describe('parseAccessibilityPreferences backward compatibility', () => {
  it('fills new fields when loading legacy payload', () => {
    const parsed = parseAccessibilityPreferences({
      fontScale: 'lg',
      highContrast: true,
      widgetHidden: false,
    });
    expect(parsed.lineSpacing).toBe('normal');
    expect(parsed.highlightHeadings).toBe(false);
    expect(parsed.muteMedia).toBe(false);
  });
});
