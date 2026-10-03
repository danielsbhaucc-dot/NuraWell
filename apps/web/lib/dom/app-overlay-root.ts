/**
 * Shared mount point for dashboard overlays (dialogs, drawers, fullscreen video).
 * Lives inside the phone-shell (`.bg-dashboard`) so `position: fixed` + full-bleed
 * layers stay constrained to the 480px desktop frame instead of the window/`100vw`.
 */
export const APP_OVERLAY_ROOT_ID = 'nura-app-overlay-root';

/** Attribute put on overlay roots portaled to body (CSS desktop containment fallback). */
export const APP_OVERLAY_ATTR = 'data-nura-overlay';

export function getAppOverlayRoot(): HTMLElement {
  if (typeof document === 'undefined') {
    throw new Error('getAppOverlayRoot() requires a browser document');
  }
  return document.getElementById(APP_OVERLAY_ROOT_ID) ?? document.body;
}
