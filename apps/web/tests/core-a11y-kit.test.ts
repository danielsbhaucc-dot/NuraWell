import { describe, it, expect } from 'vitest';
import { NURAWELL_THEME, LEGAL_FLOOR, effectiveFeatures, validateTheme, themeToCssVars } from '@core/a11y-kit';

// @core/a11y-kit is installed from platform-core (core-sync). This pins the contract NuraWell relies on
// before the widget is swapped in (UI change, needs screenshot approval).
describe('@core/a11y-kit in NuraWell', () => {
  it('ships a valid NuraWell theme (contrast checked)', () => {
    expect(NURAWELL_THEME.id).toBe('nurawell');
    expect(validateTheme(NURAWELL_THEME)).toEqual([]);
  });
  it('legal floor is always on, even if every feature is gated off', () => {
    const on = effectiveFeatures(NURAWELL_THEME, () => false);
    for (const f of LEGAL_FLOOR) expect(on).toContain(f);
  });
  it('emits CSS variables from tokens only', () => {
    const vars = themeToCssVars(NURAWELL_THEME);
    expect(vars['--a11y-bg']).toBe('#071A17');
    expect(Object.keys(vars).every((k) => k.startsWith('--a11y-'))).toBe(true);
  });
});
