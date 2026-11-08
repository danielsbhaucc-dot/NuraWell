import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  accessibilityBootstrapScript,
  accessibilityClassList,
  applyAccessibilityPreferencesToElement,
  syncMediaMute,
} from '@/lib/a11y/apply-preferences';
import { A11Y_CLASS } from '@/lib/a11y/constants';
import { DEFAULT_ACCESSIBILITY_PREFERENCES, type AccessibilityPreferences } from '@/lib/a11y/types';

function fakeRoot(initial: string[] = []) {
  const names = new Set(initial);
  return {
    classList: {
      remove: (...list: string[]) => { for (const name of list) names.delete(name); },
      add: (...list: string[]) => { for (const name of list) names.add(name); },
      contains: (name: string) => names.has(name),
    },
    names,
  };
}

const prefs = (patch: Partial<AccessibilityPreferences>): AccessibilityPreferences => ({
  ...DEFAULT_ACCESSIBILITY_PREFERENCES,
  ...patch,
});

describe('accessibility preference reversal', () => {
  it('turns one feature off and keeps the others', () => {
    const root = fakeRoot([A11Y_CLASS.highContrast, A11Y_CLASS.readableFont, A11Y_CLASS.fontLg]);
    applyAccessibilityPreferencesToElement(root as unknown as HTMLElement, prefs({ readableFont: true, fontScale: 'lg' }));
    expect([...root.names].sort()).toEqual([A11Y_CLASS.fontLg, A11Y_CLASS.readableFont].sort());
    expect(root.names.has(A11Y_CLASS.highContrast)).toBe(false);
  });

  it('clears every class when preferences return to the default', () => {
    const root = fakeRoot(Object.values(A11Y_CLASS));
    applyAccessibilityPreferencesToElement(root as unknown as HTMLElement, DEFAULT_ACCESSIBILITY_PREFERENCES);
    expect([...root.names]).toEqual([]);
  });

  it('does not leave a saturation class on after monochrome is turned off', () => {
    const on = accessibilityClassList(prefs({ monochrome: true, saturation: 'high' }));
    expect(on).toContain(A11Y_CLASS.monochrome);
    expect(on).not.toContain(A11Y_CLASS.satHigh);
    const off = accessibilityClassList(prefs({ monochrome: false, saturation: 'normal' }));
    expect(off).not.toContain(A11Y_CLASS.monochrome);
    expect(off).not.toContain(A11Y_CLASS.satHigh);
  });

  it('restores media volume when mute is turned off', () => {
    const media = { muted: false, volume: 0.4 };
    const memory = new WeakMap<object, number>();
    syncMediaMute([media], true, memory);
    expect(media).toEqual({ muted: true, volume: 0 });
    syncMediaMute([media], false, memory);
    expect(media).toEqual({ muted: false, volume: 0.4 });
  });

  it('bootstrap removes stale classes before applying saved ones', () => {
    const script = accessibilityBootstrapScript();
    expect(script).toContain('classList.remove');
    expect(script.indexOf('classList.remove')).toBeLessThan(script.indexOf('classList.add'));
  });

  it('visible text rules are strong enough to override inline heading fonts and photo backgrounds', () => {
    const css = readFileSync('app/globals.css', 'utf8');
    expect(css).toMatch(/html\.a11y-readable-font body \*/);
    expect(css).toMatch(/html\.a11y-letter-spacing body \*/);
    expect(css).toMatch(/html\.a11y-high-contrast \.onboarding-photo-bg/);
    expect(css).toMatch(/html\.a11y-high-contrast #main-content :where\(h1/);
  });
});
