import { DEFAULT_ACCESSIBILITY_PREFERENCES, type AccessibilityPreferences } from './types';

export function countActiveAccessibilityPreferences(preferences: AccessibilityPreferences): number {
  let count = 0;
  if (preferences.fontScale !== DEFAULT_ACCESSIBILITY_PREFERENCES.fontScale) count += 1;
  if (preferences.lineSpacing !== DEFAULT_ACCESSIBILITY_PREFERENCES.lineSpacing) count += 1;
  if (preferences.letterSpacing) count += 1;
  if (preferences.highContrast) count += 1;
  if (preferences.monochrome) count += 1;
  if (preferences.saturation !== DEFAULT_ACCESSIBILITY_PREFERENCES.saturation) count += 1;
  if (preferences.enhancedFocus) count += 1;
  if (preferences.underlineLinks) count += 1;
  if (preferences.highlightHeadings) count += 1;
  if (preferences.highlightElements) count += 1;
  if (preferences.showLandmarks) count += 1;
  if (preferences.readableFont) count += 1;
  if (preferences.reduceMotion) count += 1;
  if (preferences.largeCursor) count += 1;
  if (preferences.muteMedia) count += 1;
  return count;
}
