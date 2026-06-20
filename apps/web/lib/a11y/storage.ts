import { A11Y_STORAGE_KEY } from './constants';
import {
  DEFAULT_ACCESSIBILITY_PREFERENCES,
  type AccessibilityPreferences,
  type FontScale,
  type LineSpacing,
  type SaturationLevel,
} from './types';

function isFontScale(value: unknown): value is FontScale {
  return value === 'normal' || value === 'lg' || value === 'xl';
}

function isLineSpacing(value: unknown): value is LineSpacing {
  return value === 'normal' || value === 'lg' || value === 'xl';
}

function isSaturation(value: unknown): value is SaturationLevel {
  return value === 'normal' || value === 'low' || value === 'high';
}

export function parseAccessibilityPreferences(raw: unknown): AccessibilityPreferences {
  if (!raw || typeof raw !== 'object') return DEFAULT_ACCESSIBILITY_PREFERENCES;
  const input = raw as Partial<AccessibilityPreferences>;
  return {
    fontScale: isFontScale(input.fontScale) ? input.fontScale : DEFAULT_ACCESSIBILITY_PREFERENCES.fontScale,
    lineSpacing: isLineSpacing(input.lineSpacing)
      ? input.lineSpacing
      : DEFAULT_ACCESSIBILITY_PREFERENCES.lineSpacing,
    letterSpacing: Boolean(input.letterSpacing),
    highContrast: Boolean(input.highContrast),
    monochrome: Boolean(input.monochrome),
    saturation: isSaturation(input.saturation)
      ? input.saturation
      : DEFAULT_ACCESSIBILITY_PREFERENCES.saturation,
    enhancedFocus: Boolean(input.enhancedFocus),
    underlineLinks: Boolean(input.underlineLinks),
    highlightHeadings: Boolean(input.highlightHeadings),
    highlightElements: Boolean(input.highlightElements),
    showLandmarks: Boolean(input.showLandmarks),
    readableFont: Boolean(input.readableFont),
    reduceMotion: Boolean(input.reduceMotion),
    largeCursor: Boolean(input.largeCursor),
    muteMedia: Boolean(input.muteMedia),
    widgetHidden: Boolean(input.widgetHidden),
  };
}

export function readAccessibilityPreferences(): AccessibilityPreferences {
  if (typeof window === 'undefined') return DEFAULT_ACCESSIBILITY_PREFERENCES;
  try {
    const raw = window.localStorage.getItem(A11Y_STORAGE_KEY);
    if (!raw) return DEFAULT_ACCESSIBILITY_PREFERENCES;
    return parseAccessibilityPreferences(JSON.parse(raw));
  } catch {
    return DEFAULT_ACCESSIBILITY_PREFERENCES;
  }
}

export function writeAccessibilityPreferences(preferences: AccessibilityPreferences): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(A11Y_STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    /* ignore quota / private mode */
  }
}
