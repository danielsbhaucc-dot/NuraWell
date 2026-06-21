'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  applyAccessibilityPreferencesToElement,
  applyMediaMutePreference,
} from '@/lib/a11y/apply-preferences';
import {
  readAccessibilityPreferences,
  writeAccessibilityPreferences,
} from '@/lib/a11y/storage';
import {
  DEFAULT_ACCESSIBILITY_PREFERENCES,
  type AccessibilityPreferences,
  type FontScale,
  type LineSpacing,
  type SaturationLevel,
} from '@/lib/a11y/types';

type AccessibilityContextValue = {
  preferences: AccessibilityPreferences;
  setFontScale: (fontScale: FontScale) => void;
  setLineSpacing: (lineSpacing: LineSpacing) => void;
  setSaturation: (saturation: SaturationLevel) => void;
  toggle: (key: keyof Omit<AccessibilityPreferences, 'fontScale' | 'lineSpacing' | 'saturation'>) => void;
  hideWidget: () => void;
  showWidget: () => void;
  resetPreferences: () => void;
  updatePreferences: (patch: Partial<AccessibilityPreferences>) => void;
};

const AccessibilityContext = createContext<AccessibilityContextValue | null>(null);

export function AccessibilityProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<AccessibilityPreferences>(
    DEFAULT_ACCESSIBILITY_PREFERENCES,
  );
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setPreferences(readAccessibilityPreferences());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    applyAccessibilityPreferencesToElement(document.documentElement, preferences);
    writeAccessibilityPreferences(preferences);
    // Font/filter reflow can shift the viewport — restore reading position.
    window.scrollTo(scrollX, scrollY);
  }, [preferences, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    applyMediaMutePreference(preferences.muteMedia);
    if (!preferences.muteMedia) return;

    const observer = new MutationObserver(() => {
      applyMediaMutePreference(true);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [preferences.muteMedia, hydrated]);

  const updatePreferences = useCallback((patch: Partial<AccessibilityPreferences>) => {
    setPreferences((current) => ({ ...current, ...patch }));
  }, []);

  const toggle = useCallback(
    (key: keyof Omit<AccessibilityPreferences, 'fontScale' | 'lineSpacing' | 'saturation'>) => {
      setPreferences((current) => {
        const value = current[key];
        if (typeof value !== 'boolean') return current;
        return { ...current, [key]: !value };
      });
    },
    [],
  );

  const value = useMemo<AccessibilityContextValue>(
    () => ({
      preferences,
      setFontScale: (fontScale) => updatePreferences({ fontScale }),
      setLineSpacing: (lineSpacing) => updatePreferences({ lineSpacing }),
      setSaturation: (saturation) => updatePreferences({ saturation }),
      toggle,
      hideWidget: () => updatePreferences({ widgetHidden: true }),
      showWidget: () => updatePreferences({ widgetHidden: false }),
      resetPreferences: () => setPreferences(DEFAULT_ACCESSIBILITY_PREFERENCES),
      updatePreferences,
    }),
    [preferences, toggle, updatePreferences],
  );

  return <AccessibilityContext.Provider value={value}>{children}</AccessibilityContext.Provider>;
}

export function useAccessibility(): AccessibilityContextValue {
  const ctx = useContext(AccessibilityContext);
  if (!ctx) {
    throw new Error('useAccessibility must be used within AccessibilityProvider');
  }
  return ctx;
}
