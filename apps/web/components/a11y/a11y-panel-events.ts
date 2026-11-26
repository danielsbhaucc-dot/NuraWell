/** Open the site-wide accessibility panel (same component as the FAB). */
export const A11Y_PANEL_OPEN_EVENT = 'nw:a11y-panel:open';

/** Ask the cookie banner to show or hide a «נגישות» alternative while the FAB is reserved. */
export const A11Y_BANNER_ALT_EVENT = 'nw:a11y-banner-alt';

declare global {
  interface Window {
    __nwA11yBannerAlt?: boolean;
  }
}

export function openAccessibilityPanel(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(A11Y_PANEL_OPEN_EVENT));
}

export function setAccessibilityBannerAlt(needed: boolean): void {
  if (typeof window === 'undefined') return;
  window.__nwA11yBannerAlt = needed;
  window.dispatchEvent(new CustomEvent(A11Y_BANNER_ALT_EVENT, { detail: { needed } }));
}

export function isAccessibilityBannerAltNeeded(): boolean {
  return typeof window !== 'undefined' && Boolean(window.__nwA11yBannerAlt);
}
