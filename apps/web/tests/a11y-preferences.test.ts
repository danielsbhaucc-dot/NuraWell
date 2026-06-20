import { describe, expect, it } from 'vitest';
import { parseAccessibilityPreferences } from '@/lib/a11y/storage';
import { DEFAULT_ACCESSIBILITY_PREFERENCES } from '@/lib/a11y/types';

describe('parseAccessibilityPreferences', () => {
  it('returns defaults for invalid input', () => {
    expect(parseAccessibilityPreferences(null)).toEqual(DEFAULT_ACCESSIBILITY_PREFERENCES);
    expect(parseAccessibilityPreferences('bad')).toEqual(DEFAULT_ACCESSIBILITY_PREFERENCES);
  });

  it('merges valid partial preferences', () => {
    expect(
      parseAccessibilityPreferences({
        fontScale: 'lg',
        highContrast: true,
        widgetHidden: true,
      }),
    ).toEqual({
      ...DEFAULT_ACCESSIBILITY_PREFERENCES,
      fontScale: 'lg',
      highContrast: true,
      widgetHidden: true,
    });
  });

  it('rejects invalid font scale', () => {
    expect(parseAccessibilityPreferences({ fontScale: 'huge' }).fontScale).toBe('normal');
  });
});
