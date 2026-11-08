import { A11Y_CLASS } from './constants';
import type { AccessibilityPreferences } from './types';

const ALL_CLASSES = Object.values(A11Y_CLASS);

/** Classes that should be present for these preferences. Everything else in A11Y_CLASS is off. */
export function accessibilityClassList(preferences: AccessibilityPreferences): string[] {
  const classes: string[] = [];
  if (preferences.fontScale === 'lg') classes.push(A11Y_CLASS.fontLg);
  if (preferences.fontScale === 'xl') classes.push(A11Y_CLASS.fontXl);
  if (preferences.lineSpacing === 'lg') classes.push(A11Y_CLASS.lineLg);
  if (preferences.lineSpacing === 'xl') classes.push(A11Y_CLASS.lineXl);
  if (preferences.letterSpacing) classes.push(A11Y_CLASS.letterSpacing);
  if (preferences.highContrast) classes.push(A11Y_CLASS.highContrast);
  if (preferences.monochrome) {
    classes.push(A11Y_CLASS.monochrome);
  } else {
    if (preferences.saturation === 'low') classes.push(A11Y_CLASS.satLow);
    if (preferences.saturation === 'high') classes.push(A11Y_CLASS.satHigh);
  }
  if (preferences.enhancedFocus) classes.push(A11Y_CLASS.enhancedFocus);
  if (preferences.underlineLinks) classes.push(A11Y_CLASS.underlineLinks);
  if (preferences.highlightHeadings) classes.push(A11Y_CLASS.highlightHeadings);
  if (preferences.highlightElements) classes.push(A11Y_CLASS.highlightElements);
  if (preferences.showLandmarks) classes.push(A11Y_CLASS.showLandmarks);
  if (preferences.readableFont) classes.push(A11Y_CLASS.readableFont);
  if (preferences.reduceMotion) classes.push(A11Y_CLASS.reduceMotion);
  if (preferences.largeCursor) classes.push(A11Y_CLASS.largeCursor);
  return classes;
}

export function accessibilityClassesMatch(root: HTMLElement, preferences: AccessibilityPreferences): boolean {
  const wanted = new Set(accessibilityClassList(preferences));
  return ALL_CLASSES.every((name) => root.classList.contains(name) === wanted.has(name));
}

export function applyAccessibilityPreferencesToElement(
  root: HTMLElement,
  preferences: AccessibilityPreferences,
): void {
  root.classList.remove(...ALL_CLASSES);
  const next = accessibilityClassList(preferences);
  if (next.length > 0) root.classList.add(...next);
}

type MuteTarget = { muted: boolean; volume: number };
const previousVolume = new WeakMap<object, number>();

/** Mute sets volume to 0. Unmute restores the volume from before that mute. */
export function syncMediaMute(elements: MuteTarget[], mute: boolean, memory: WeakMap<object, number> = previousVolume): void {
  for (const media of elements) {
    if (mute) {
      if (!memory.has(media)) memory.set(media, media.volume);
      media.muted = true;
      media.volume = 0;
      continue;
    }
    media.muted = false;
    const prev = memory.get(media);
    if (prev !== undefined) {
      media.volume = prev;
      memory.delete(media);
    }
  }
}

export function applyMediaMutePreference(mute: boolean): void {
  syncMediaMute([...document.querySelectorAll('video, audio')] as HTMLMediaElement[], mute);
}

/** Inline bootstrap — clears every a11y class, then applies only the saved ones, before hydration. */
export function accessibilityBootstrapScript(): string {
  const k = A11Y_CLASS;
  return `(function(){try{var all=${JSON.stringify(ALL_CLASSES)};var c=${JSON.stringify(k)};var s=${JSON.stringify(
    'nurawell-a11y-preferences',
  )};var h=document.documentElement;if(!h)return;for(var i=0;i<all.length;i++)h.classList.remove(all[i]);var raw=localStorage.getItem(s);if(!raw)return;var p=JSON.parse(raw);if(!p)return;if(p.fontScale==='lg')h.classList.add(c.fontLg);if(p.fontScale==='xl')h.classList.add(c.fontXl);if(p.lineSpacing==='lg')h.classList.add(c.lineLg);if(p.lineSpacing==='xl')h.classList.add(c.lineXl);if(p.letterSpacing)h.classList.add(c.letterSpacing);if(p.highContrast)h.classList.add(c.highContrast);if(p.monochrome)h.classList.add(c.monochrome);else{if(p.saturation==='low')h.classList.add(c.satLow);if(p.saturation==='high')h.classList.add(c.satHigh);}if(p.enhancedFocus)h.classList.add(c.enhancedFocus);if(p.underlineLinks)h.classList.add(c.underlineLinks);if(p.highlightHeadings)h.classList.add(c.highlightHeadings);if(p.highlightElements)h.classList.add(c.highlightElements);if(p.showLandmarks)h.classList.add(c.showLandmarks);if(p.readableFont)h.classList.add(c.readableFont);if(p.reduceMotion)h.classList.add(c.reduceMotion);if(p.largeCursor)h.classList.add(c.largeCursor);}catch(e){}})();`;
}
