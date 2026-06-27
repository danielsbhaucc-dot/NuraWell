export type GuideViewMode = 'read' | 'path';

const STORAGE_KEY = 'nurawell_guide_view_mode';

export function readGuideViewModePreference(): GuideViewMode {
  if (typeof window === 'undefined') return 'read';
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('mode');
    if (fromUrl === 'path' || fromUrl === 'read') return fromUrl;
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored === 'path' || stored === 'read') return stored;
  } catch {
    /* ignore */
  }
  return 'read';
}

export function persistGuideViewModePreference(mode: GuideViewMode): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}

export function lessonHrefWithViewMode(lessonId: string, mode?: GuideViewMode): string {
  const href = `/lessons/${lessonId}`;
  if (mode === 'path') return `${href}?mode=path`;
  return href;
}
