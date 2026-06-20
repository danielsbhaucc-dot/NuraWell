import { A11Y_CLASS } from './constants';
import type { AccessibilityPreferences } from './types';

const ALL_CLASSES = Object.values(A11Y_CLASS);

export function applyAccessibilityPreferencesToElement(
  root: HTMLElement,
  preferences: AccessibilityPreferences,
): void {
  root.classList.remove(...ALL_CLASSES);

  if (preferences.fontScale === 'lg') root.classList.add(A11Y_CLASS.fontLg);
  if (preferences.fontScale === 'xl') root.classList.add(A11Y_CLASS.fontXl);
  if (preferences.lineSpacing === 'lg') root.classList.add(A11Y_CLASS.lineLg);
  if (preferences.lineSpacing === 'xl') root.classList.add(A11Y_CLASS.lineXl);
  if (preferences.letterSpacing) root.classList.add(A11Y_CLASS.letterSpacing);
  if (preferences.highContrast) root.classList.add(A11Y_CLASS.highContrast);
  if (preferences.monochrome) {
    root.classList.add(A11Y_CLASS.monochrome);
  } else {
    if (preferences.saturation === 'low') root.classList.add(A11Y_CLASS.satLow);
    if (preferences.saturation === 'high') root.classList.add(A11Y_CLASS.satHigh);
  }
  if (preferences.enhancedFocus) root.classList.add(A11Y_CLASS.enhancedFocus);
  if (preferences.underlineLinks) root.classList.add(A11Y_CLASS.underlineLinks);
  if (preferences.highlightHeadings) root.classList.add(A11Y_CLASS.highlightHeadings);
  if (preferences.highlightElements) root.classList.add(A11Y_CLASS.highlightElements);
  if (preferences.showLandmarks) root.classList.add(A11Y_CLASS.showLandmarks);
  if (preferences.readableFont) root.classList.add(A11Y_CLASS.readableFont);
  if (preferences.reduceMotion) root.classList.add(A11Y_CLASS.reduceMotion);
  if (preferences.largeCursor) root.classList.add(A11Y_CLASS.largeCursor);
}

export function applyMediaMutePreference(mute: boolean): void {
  document.querySelectorAll('video, audio').forEach((node) => {
    const media = node as HTMLMediaElement;
    media.muted = mute;
    if (mute) media.volume = 0;
  });
}

/** Inline bootstrap — applies saved classes before React hydration. */
export function accessibilityBootstrapScript(): string {
  const k = A11Y_CLASS;
  return `(function(){try{var c=${JSON.stringify(k)};var s=${JSON.stringify(
    'nurawell-a11y-preferences',
  )};var raw=localStorage.getItem(s);if(!raw)return;var p=JSON.parse(raw);var h=document.documentElement;if(!h||!p)return;if(p.fontScale==='lg')h.classList.add(c.fontLg);if(p.fontScale==='xl')h.classList.add(c.fontXl);if(p.lineSpacing==='lg')h.classList.add(c.lineLg);if(p.lineSpacing==='xl')h.classList.add(c.lineXl);if(p.letterSpacing)h.classList.add(c.letterSpacing);if(p.highContrast)h.classList.add(c.highContrast);if(p.monochrome)h.classList.add(c.monochrome);if(p.saturation==='low')h.classList.add(c.satLow);if(p.saturation==='high')h.classList.add(c.satHigh);if(p.enhancedFocus)h.classList.add(c.enhancedFocus);if(p.underlineLinks)h.classList.add(c.underlineLinks);if(p.highlightHeadings)h.classList.add(c.highlightHeadings);if(p.highlightElements)h.classList.add(c.highlightElements);if(p.showLandmarks)h.classList.add(c.showLandmarks);if(p.readableFont)h.classList.add(c.readableFont);if(p.reduceMotion)h.classList.add(c.reduceMotion);if(p.largeCursor)h.classList.add(c.largeCursor);}catch(e){}})();`;
}
