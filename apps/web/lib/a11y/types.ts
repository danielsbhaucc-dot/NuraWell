export type FontScale = 'normal' | 'lg' | 'xl';
export type LineSpacing = 'normal' | 'lg' | 'xl';
export type SaturationLevel = 'normal' | 'low' | 'high';

export type AccessibilityPreferences = {
  fontScale: FontScale;
  lineSpacing: LineSpacing;
  letterSpacing: boolean;
  highContrast: boolean;
  monochrome: boolean;
  saturation: SaturationLevel;
  enhancedFocus: boolean;
  underlineLinks: boolean;
  highlightHeadings: boolean;
  highlightElements: boolean;
  showLandmarks: boolean;
  readableFont: boolean;
  reduceMotion: boolean;
  largeCursor: boolean;
  muteMedia: boolean;
  widgetHidden: boolean;
};

export const DEFAULT_ACCESSIBILITY_PREFERENCES: AccessibilityPreferences = {
  fontScale: 'normal',
  lineSpacing: 'normal',
  letterSpacing: false,
  highContrast: false,
  monochrome: false,
  saturation: 'normal',
  enhancedFocus: false,
  underlineLinks: false,
  highlightHeadings: false,
  highlightElements: false,
  showLandmarks: false,
  readableFont: false,
  reduceMotion: false,
  largeCursor: false,
  muteMedia: false,
  widgetHidden: false,
};

export type AccessibilityAuditSummary = {
  totalImages: number;
  missingAlt: number;
  emptyAlt: number;
  samples: Array<{
    id: string;
    title: string | null;
    folder: string | null;
    url: string | null;
  }>;
};
