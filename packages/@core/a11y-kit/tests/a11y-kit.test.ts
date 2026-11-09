import { describe, it, expect } from 'vitest';
import {
  defineA11yTheme, applyConsoleOverrides, themeToCss, themeToCssVars, contrastRatio, validateTheme,
  panelZoom, effectiveFeatures, A11yThemeError, DEFAULT_THEME, LEGAL_FLOOR, CONSOLE_FIELDS, CONTRAST_RULES, HC_MIN,
} from '@core/a11y-kit';
import { readFileSync } from 'node:fs';

describe('defineA11yTheme', () => {
  it('default theme passes every contrast rule', () => {
    const t = defineA11yTheme({ id: 'default' });
    for (const r of CONTRAST_RULES) expect(contrastRatio(t.colors[r.fg], t.colors[r.bg])).toBeGreaterThanOrEqual(r.min);
    expect(validateTheme(t)).toEqual([]);
  });
  it('high-contrast palettes are ≥7:1 and light is really light', () => {
    const t = defineA11yTheme({ id: 'hc' });
    for (const p of Object.values(t.highContrast)) for (const k of ['fg', 'link', 'focus'] as const) expect(contrastRatio(p[k], p.bg)).toBeGreaterThanOrEqual(HC_MIN);
    expect(t.highContrast.light.bg).toBe('#FFFFFF');
    expect(t.highContrast.light).not.toEqual(t.highContrast.blackYellow);
  });
  it('per-client override merges deep and keeps defaults', () => {
    const t = defineA11yTheme({ id: 'vet-clinic', colors: { primary: '#0A5C44' }, dir: 'ltr', lang: 'en', radius: { md: 4 } });
    expect(t.colors.primary).toBe('#0A5C44');
    expect(t.colors.bg).toBe(DEFAULT_THEME.colors.bg);
    expect(t.dir).toBe('ltr');
    expect(t.radius).toEqual({ ...DEFAULT_THEME.radius, md: 4 });
    expect(Object.isFrozen(t)).toBe(true);
  });
  it('throws with Hebrew issues on low contrast / bad tokens', () => {
    try {
      defineA11yTheme({ id: 'Bad Id', colors: { fg: '#222222' }, fontScale: { min: 0.8 } });
      throw new Error('should throw');
    } catch (e) {
      expect(e).toBeInstanceOf(A11yThemeError);
      const paths = (e as A11yThemeError).issues.map((i) => i.path);
      expect(paths).toEqual(expect.arrayContaining(['id', 'colors.fg/bg', 'fontScale.min']));
    }
    expect(() => defineA11yTheme({ id: 'x', colors: { primary: 'red' as `#${string}` } })).toThrow(/colors.primary/);
    expect(() => defineA11yTheme({ id: 'x', fonts: { body: 'a;}body{display:none' } })).toThrow(/fonts.body/);
    expect(() => defineA11yTheme({ id: 'x', highContrast: { light: { bg: '#000000' } } })).toThrow(/highContrast.light/);
  });
  it('legal floor is always on, even if the theme drops it', () => {
    const t = defineA11yTheme({ id: 'mini', features: ['readingGuide'] });
    for (const f of LEGAL_FLOOR) expect(t.features).toContain(f);
    expect(t.features).toContain('readingGuide');
  });
  it('ignores prototype pollution and unknown keys', () => {
    const evil = JSON.parse('{"id":"p","__proto__":{"polluted":1},"nope":1,"colors":{"x":"#000"}}');
    const t = defineA11yTheme(evil);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect((t as unknown as Record<string, unknown>).nope).toBeUndefined();
    expect((t.colors as unknown as Record<string, unknown>).x).toBeUndefined();
  });
});

describe('applyConsoleOverrides', () => {
  const base = defineA11yTheme({ id: 'client-a' });
  it('applies valid values', () => {
    const r = applyConsoleOverrides(base, { primary: '#5B3FD6', radius: 24, dir: 'ltr', tileGap: 12 });
    expect(r.rejected).toEqual([]);
    expect(r.applied).toEqual(['primary', 'radius', 'dir', 'tileGap']);
    expect(r.theme.colors.primary).toBe('#5B3FD6');
    expect(r.theme.radius.md).toBe(24);
    expect(base.colors.primary).toBe(DEFAULT_THEME.colors.primary); // input untouched
  });
  it('rejects a colour that breaks contrast and keeps the old one', () => {
    const r = applyConsoleOverrides(base, { fg: '#20263A', primary: '#5B3FD6' });
    expect(r.rejected.map((x) => x.key)).toEqual(['fg']);
    expect(r.rejected[0]!.reason).toMatch(/ניגודיות/);
    expect(r.theme.colors.fg).toBe(base.colors.fg);
    expect(r.theme.colors.primary).toBe('#5B3FD6');
  });
  it('rejects unknown fields, off-list selects, out-of-range numbers', () => {
    const r = applyConsoleOverrides(base, { evil: 1, fontBody: 'Comic Sans', tileGap: 99, fontScaleDefault: 0.5 });
    expect(r.applied).toEqual([]);
    expect(r.rejected.map((x) => x.key)).toEqual(['evil', 'fontBody', 'tileGap', 'fontScaleDefault']);
  });
  it('cannot switch off the legal floor', () => {
    const r = applyConsoleOverrides(base, { features: ['readingGuide'] });
    expect(r.rejected[0]!.reason).toMatch(/רצפת חובה/);
    for (const f of LEGAL_FLOOR) expect(r.theme.features).toContain(f);
    expect(r.theme.features).not.toContain('bigCursor');
  });
  it('every console field maps to a real theme path', () => {
    for (const f of CONSOLE_FIELDS) {
      const v = f.path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], base);
      expect(v, f.path).not.toBeUndefined();
    }
  });
});

describe('output helpers', () => {
  const t = defineA11yTheme({ id: 'out' });
  it('css vars', () => {
    const v = themeToCssVars(t);
    expect(v['--a11y-primary']).toBe(t.colors.primary);
    expect(v['--a11y-on-primary']).toBe(t.colors.onPrimary);
    expect(v['--a11y-hc-light-bg']).toBe('#FFFFFF');
    expect(v['--a11y-radius-md']).toBe('14px');
    expect(themeToCss(t, '[data-a11y-theme="out"]')).toMatch(/^\[data-a11y-theme="out"\] \{\n  --a11y-bg: #0B1020;/);
    expect(() => themeToCss(t, 'a{}body')).toThrow();
  });
  it('panelZoom clamps to 1..maxZoom', () => {
    expect(panelZoom(t, 0.8)).toBe(1);
    expect(panelZoom(t, 1.1)).toBe(1.1);
    expect(panelZoom(t, 1.6)).toBe(1.25);
  });
  it('effectiveFeatures: gate filters, fail-open on throw, floor always up', () => {
    expect(effectiveFeatures(t, (f) => f !== 'bigCursor')).not.toContain('bigCursor');
    expect(effectiveFeatures(t, () => { throw new Error('gate down'); })).toEqual(t.features);
    const none = effectiveFeatures(t, () => false);
    expect([...none].sort()).toEqual([...LEGAL_FLOOR].sort());
  });
  it('module.json is valid against the schema basics', () => {
    const m = JSON.parse(readFileSync(new URL('../module.json', import.meta.url), 'utf8'));
    expect(m.id).toBe('a11y-kit');
    expect(m.package).toBe('@core/a11y-kit');
    for (const k of ['version', 'distribution', 'category', 'toggleable', 'description', 'requires', 'env', 'migrations', 'conformance', 'store']) expect(m).toHaveProperty(k);
  });
});
