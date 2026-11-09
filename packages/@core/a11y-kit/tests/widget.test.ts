// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import axe from 'axe-core';
import { readFileSync, readdirSync } from 'node:fs';
import {
  mountA11yWidget, NURAWELL_THEME, NEHORA_THEME, CONTRAST_RULES, HC_MIN, contrastRatio, validateTheme, buildEffectsCss,
  DEFAULT_SETTINGS, sanitizeSettings, isAltShortcut, boxesOverlap, liftToClear, fabReserveCss, findFabOverlaps,
  dyslexiaFontFace, HIGH_CONTRAST_STATUS, panelZoomFor, defineA11yTheme, type A11yWidgetHandle,
} from '@core/a11y-kit';

const key = (k: string, extra: Partial<KeyboardEventInit> = {}) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...extra }));
let w: A11yWidgetHandle;
beforeEach(() => { localStorage.clear(); document.title = 'בדיקה'; document.documentElement.lang = 'he'; document.documentElement.dir = 'rtl'; document.body.innerHTML = '<main><h1>דף לדוגמה</h1><p>טקסט</p><a href="/x">קישור</a><button type="submit" id="go">כניסה לחשבון</button><video autoplay></video></main>'; w = mountA11yWidget({ theme: NURAWELL_THEME, statementHref: '/accessibility' }); });
afterEach(() => { w.destroy(); });

describe('themes', () => {
  for (const t of [NURAWELL_THEME, NEHORA_THEME]) it(`${t.id}: every contrast rule + HC ≥7:1`, () => {
    expect(validateTheme(t)).toEqual([]);
    for (const r of CONTRAST_RULES) expect(contrastRatio(t.colors[r.fg], t.colors[r.bg])).toBeGreaterThanOrEqual(r.min);
    for (const p of Object.values(t.highContrast)) expect(contrastRatio(p.fg, p.bg)).toBeGreaterThanOrEqual(HC_MIN);
  });
  it('NuraWell: teal round FAB at bottom-start, Heebo/Rubik via host var, glass', () => {
    expect(NURAWELL_THEME.panel.side).toBe('start');
    expect(NURAWELL_THEME.fonts.body).toMatch(/^var\(--font-heebo\), "Heebo"/);
    expect(NURAWELL_THEME.fonts.heading).toMatch(/Rubik/);
    expect(NURAWELL_THEME.glass).toBe(true);
    expect(NURAWELL_THEME.fab.size).toBeGreaterThanOrEqual(44);
  });
  it('font tokens reject url()/outside services', () => {
    expect(() => defineA11yTheme({ id: 'x', fonts: { body: 'url(https://evil.test/f.woff2)' } })).toThrow();
    expect(() => defineA11yTheme({ id: 'x', fonts: { body: 'var(--f); } body{x' } })).toThrow();
  });
  it('HC status colors ≥7:1', () => {
    for (const [m, st] of Object.entries(HIGH_CONTRAST_STATUS)) for (const c of Object.values(st)) expect(contrastRatio(c, NURAWELL_THEME.highContrast[m as 'light'].bg)).toBeGreaterThanOrEqual(7);
  });
});

describe('Maaser #6 fixes carried over', () => {
  it('1 real light high-contrast: full palette, not a filter', () => {
    const css = buildEffectsCss({ ...DEFAULT_SETTINGS, contrast: 'light' }, NURAWELL_THEME, { fontBase: '/a11y-fonts' });
    expect(css).toContain('background-color:#FFFFFF'); expect(css).toContain('color:#000000'); expect(css).toContain('#0033CC');
    expect(css).not.toMatch(/filter:\s*invert/);
  });
  it('2 dyslexia font is self-hosted Alef (same-origin path only)', () => {
    const css = buildEffectsCss({ ...DEFAULT_SETTINGS, dyslexiaFont: true }, NURAWELL_THEME, { fontBase: '/a11y-fonts' });
    expect(css).toContain('url("/a11y-fonts/alef-hebrew-400-normal.woff2")');
    expect(() => dyslexiaFontFace('https://cdn.test/f')).toThrow(); expect(() => dyslexiaFontFace('//cdn.test/f')).toThrow();
    if (typeof readdirSync !== 'function') return; // jsdom pool may externalize node:fs
    const files = readdirSync('packages/a11y-kit/assets/fonts'); expect(files).toContain('OFL-Alef.txt'); expect(files.filter((f) => f.endsWith('.woff2'))).toHaveLength(4);
  });
  it('3 switches: role=switch + aria-checked, Space/click toggles exactly once', () => {
    w.open();
    const b = [...document.querySelectorAll<HTMLButtonElement>('[role="switch"]')].find((x) => x.textContent?.includes('טקסט מודגש'))!;
    expect(b.getAttribute('aria-checked')).toBe('false');
    b.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })); // no custom handler ⇒ no double fire
    b.click();
    expect(b.getAttribute('aria-checked')).toBe('true'); expect(w.get().boldText).toBe(true);
  });
  it('4 cycle buttons: aria-pressed + "רמה X מתוך N"', () => {
    w.open();
    const b = [...document.querySelectorAll<HTMLButtonElement>('[aria-pressed]')].find((x) => x.textContent?.includes('ריווח שורות'))!;
    expect(b.textContent).toContain('רגיל'); b.click();
    expect(b.getAttribute('aria-pressed')).toBe('true'); expect(b.textContent).toContain('רמה 1 מתוך 3');
  });
  it('5 accordion: aria-expanded + aria-controls', () => {
    const acc = [...document.querySelectorAll<HTMLButtonElement>('.ca11y-acc')];
    expect(acc.length).toBe(4); expect(acc[0]!.getAttribute('aria-expanded')).toBe('true');
    const r = document.getElementById(acc[1]!.getAttribute('aria-controls')!)!; expect(r.hidden).toBe(true);
    acc[1]!.click(); expect(acc[1]!.getAttribute('aria-expanded')).toBe('true'); expect(r.hidden).toBe(false);
  });
  it('6 segmented = radiogroup/radio, arrows move (RTL)', () => {
    w.open();
    const g = [...document.querySelectorAll('[role="radiogroup"]')].find((x) => x.textContent?.includes('שחור־צהוב'))!;
    const radios = [...g.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
    expect(radios[0]!.getAttribute('aria-checked')).toBe('true');
    g.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(w.get().contrast).toBe('blackYellow'); expect(radios[1]!.getAttribute('aria-checked')).toBe('true'); expect(radios[1]!.tabIndex).toBe(0);
  });
  it('7 focus stays on the control after a change; Esc closes and returns focus to the FAB', () => {
    const fab = document.querySelector<HTMLButtonElement>('.ca11y-fab')!; fab.focus(); fab.click();
    expect(document.querySelector('[role="dialog"]')!.contains(document.activeElement)).toBe(true);
    const b = document.querySelector<HTMLButtonElement>('[role="switch"]')!; b.focus(); b.click();
    expect(document.activeElement).toBe(b);
    key('Escape'); expect(w.isOpen()).toBe(false); expect(document.activeElement).toBe(fab); expect(fab.getAttribute('aria-expanded')).toBe('false');
  });
  it('8 panel zoom follows text size, clamped to 1.25', () => {
    w.set({ fontSize: NURAWELL_THEME.fontScale.steps });
    expect(panelZoomFor(NURAWELL_THEME, w.get())).toBe(1.25);
    expect(w.root.style.getPropertyValue('--ca11y-zoom')).toBe('1.25');
    expect(document.getElementById('ca11y-root')!.querySelector('style')!.textContent).toContain('calc(100vw / var(--ca11y-zoom,1))');
  });
  it('9 low transparency merges rgba onto the theme bg (opaque), reversibly', () => {
    const d = document.createElement('div'); d.style.backgroundColor = 'rgba(255, 255, 255, 0.5)'; document.querySelector('main')!.append(d);
    w.set({ lowTransparency: true }); expect(d.style.backgroundColor).toMatch(/^rgb\(/);
    w.set({ lowTransparency: false }); expect(d.style.backgroundColor).toBe('rgba(255, 255, 255, 0.5)');
  });
  it('10 mute media mutes without hiding, restores', () => {
    const v = document.querySelector('video')!; w.set({ muteMedia: true }); expect(v.muted).toBe(true);
    expect(document.getElementById('ca11y-effects')!.textContent).not.toMatch(/video[^{]*\{[^}]*display:\s*none/);
    w.set({ muteMedia: false }); expect(v.muted).toBe(false);
  });
  it('11 prefers-reduced-motion honoured always', () => {
    expect(document.getElementById('ca11y-effects')!.textContent).toContain('@media (prefers-reduced-motion: reduce)');
  });
  it('12 Alt/Option+A by physical key (Mac å, Hebrew ש), Alt+R resets', () => {
    expect(isAltShortcut({ altKey: true, ctrlKey: false, metaKey: false, code: 'KeyA', key: 'å' }, 'a')).toBe(true);
    expect(isAltShortcut({ altKey: true, ctrlKey: false, metaKey: false, code: '', key: 'ש' }, 'a')).toBe(true);
    expect(isAltShortcut({ altKey: true, ctrlKey: true, metaKey: false, code: 'KeyA', key: 'a' }, 'a')).toBe(false);
    key('å', { altKey: true, code: 'KeyA' }); expect(w.isOpen()).toBe(true);
    w.set({ boldText: true }); key('®', { altKey: true, code: 'KeyR' }); expect(w.get().boldText).toBe(false);
  });
});

describe('widget', () => {
  it('axe: 0 violations closed and open', async () => {
    for (const step of ['closed', 'open']) {
      if (step === 'open') w.open();
      const r = await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'], rules: { 'color-contrast': { enabled: false } } });
      expect(r.violations.map((v) => `${step}:${v.id}`)).toEqual([]);
    }
  });
  it('dialog is not native: role=dialog div, aria-modal; Tab is trapped', () => {
    expect(document.querySelector('dialog')).toBeNull(); w.open();
    const d = document.querySelector('[role="dialog"]')!; expect(d.getAttribute('aria-modal')).toBe('true'); expect(d.getAttribute('aria-labelledby')).toBe('ca11y-title');
    const f = [...d.querySelectorAll<HTMLElement>('button, a[href]')].filter((x) => !x.closest('[hidden]') && x.tabIndex >= 0);
    f[f.length - 1]!.focus(); key('Tab'); expect(document.activeElement).toBe(f[0]);
  });
  it('FAB label reports active count in singular/neutral Hebrew', () => {
    const fab = document.querySelector('.ca11y-fab')!;
    expect(fab.getAttribute('aria-label')).toBe('תפריט נגישות');
    w.set({ boldText: true }); expect(fab.getAttribute('aria-label')).toBe('תפריט נגישות, התאמה פעילה אחת');
    w.set({ underlineLinks: true }); expect(fab.getAttribute('aria-label')).toBe('תפריט נגישות, 2 התאמות פעילות');
  });
  it('copy: Hebrew, no plural imperatives, maqaf not hyphen, no chips/vendor names/outside URLs', () => {
    w.open();
    const text = document.getElementById('ca11y-root')!.textContent!;
    expect(text).toContain('שחור־צהוב'); expect(text).not.toMatch(/[א-ת]-[א-ת]/);
    expect(text).not.toMatch(/\b(לחצו|בחרו|הפעילו|סגרו|גררו)\b/);
    if (typeof readdirSync !== 'function') return;
    const src = readdirSync('packages/a11y-kit/src').map((f) => readFileSync(`packages/a11y-kit/src/${f}`, 'utf8')).join('\n');
    expect(src).not.toMatch(/fonts\.googleapis|gstatic|cdn\.|unpkg|jsdelivr|userway|accessibe|<dialog|alert\(|confirm\(|prompt\(/i);
    expect(src).not.toMatch(/class="[^"]*chip/);
  });
  it('storage is sanitized', () => {
    expect(sanitizeSettings({ fontSize: 99, contrast: 'evil', boldText: 'yes', __proto__: { x: 1 } }, 4)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings({ fontSize: 2, contrast: 'light' }, 4)).toMatchObject({ fontSize: 2, contrast: 'light' });
  });
  it('settings persist across mounts', () => {
    w.set({ highlightLinks: true }); w.destroy();
    w = mountA11yWidget({ theme: NURAWELL_THEME }); expect(w.get().highlightLinks).toBe(true);
  });
  it('destroy restores the host page', () => {
    w.set({ muteMedia: true }); w.destroy();
    expect(document.getElementById('ca11y-root')).toBeNull(); expect(document.getElementById('ca11y-effects')).toBeNull();
    expect(document.documentElement.style.getPropertyValue('--a11y-fab-reserve-block')).toBe('');
    w = mountA11yWidget({ theme: NURAWELL_THEME });
  });
  it('gating hides a tool but never the legal floor', () => {
    w.destroy(); w = mountA11yWidget({ theme: NURAWELL_THEME, gate: (f) => f !== 'boldText' && f !== 'contrast' });
    const t = document.getElementById('ca11y-root')!.textContent!;
    expect(t).not.toContain('טקסט מודגש'); expect(t).toContain('שחור־צהוב');
  });
});

describe('safe area + overlap helper', () => {
  it('reserve var published on <html> and host CSS helper', () => {
    expect(document.documentElement.style.getPropertyValue('--a11y-fab-reserve-block')).toBe('88px');
    expect(fabReserveCss()).toContain('var(--a11y-fab-reserve-block');
  });
  it('liftToClear raises the FAB above an obstacle and caps', () => {
    const fab = { left: 300, right: 356, top: 700, bottom: 756 };
    expect(liftToClear(fab, [], 16, 400)).toBe(0);
    const btn = { left: 16, right: 374, top: 690, bottom: 740 };
    const l = liftToClear(fab, [btn], 16, 400);
    expect(boxesOverlap({ ...fab, top: fab.top - l, bottom: fab.bottom - l }, btn, 8)).toBe(false);
    expect(liftToClear(fab, [{ left: 0, right: 400, top: 0, bottom: 800 }], 16, 120)).toBe(120);
  });
  it('findFabOverlaps returns [] when nothing is laid out (jsdom)', () => { expect(findFabOverlaps(document)).toEqual([]); });
});
