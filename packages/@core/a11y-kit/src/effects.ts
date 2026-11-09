/**
 * הגדרות המשתמש + ה־CSS שמוחל על הדף המארח (web). טהור ככל האפשר: buildEffectsCss מחזיר מחרוזת,
 * applyEffects כותב <style> אחד ומבצע את המעברים שדורשים DOM (השתקת מדיה, אטימת זכוכית).
 * בלי קריאות רשת: הגופן היחיד (Alef, SIL OFL) נטען מ־fontBase של המארח.
 */
import type { A11yTheme, Feature } from './core.ts';

export type ContrastMode = 'off' | 'blackYellow' | 'light';
export type SaturationMode = 'off' | 'low' | 'mono';
export type AlignMode = 'off' | 'start' | 'center';

export interface A11ySettings {
  fontSize: number; lineHeight: number; letterSpacing: number; wordSpacing: number;
  contrast: ContrastMode; saturation: SaturationMode;
  highlightLinks: boolean; underlineLinks: boolean; highlightHeadings: boolean; highlightFocus: boolean;
  readableFont: boolean; dyslexiaFont: boolean; boldText: boolean; textAlign: AlignMode;
  stopAnimations: boolean; muteMedia: boolean; hideImages: boolean; lowTransparency: boolean;
  readingGuide: boolean; readingMask: boolean; bigCursor: boolean; keyboardNav: boolean;
}

export const DEFAULT_SETTINGS: Readonly<A11ySettings> = Object.freeze({
  fontSize: 0, lineHeight: 0, letterSpacing: 0, wordSpacing: 0,
  contrast: 'off', saturation: 'off',
  highlightLinks: false, underlineLinks: false, highlightHeadings: false, highlightFocus: false,
  readableFont: false, dyslexiaFont: false, boldText: false, textAlign: 'off',
  stopAnimations: false, muteMedia: false, hideImages: false, lowTransparency: false,
  readingGuide: false, readingMask: false, bigCursor: false, keyboardNav: false,
});

/** כמה רמות לכל מדד (0 = רגיל). */
export const LEVELS = { lineHeight: 3, letterSpacing: 3, wordSpacing: 3 } as const;
const LH = [0, 1.6, 1.9, 2.2], LS = [0, 0.05, 0.1, 0.14], WS = [0, 0.12, 0.2, 0.3];

/** הגדרה ← הכלי ברשימת FEATURES (ל־gating ולרצפת החובה). */
export const SETTING_FEATURE: Record<keyof A11ySettings, Feature> = {
  fontSize: 'fontSize', lineHeight: 'lineHeight', letterSpacing: 'letterSpacing', wordSpacing: 'wordSpacing',
  contrast: 'contrast', saturation: 'saturation', highlightLinks: 'highlightLinks', underlineLinks: 'underlineLinks',
  highlightHeadings: 'highlightHeadings', highlightFocus: 'highlightFocus', readableFont: 'readableFont',
  dyslexiaFont: 'dyslexiaFont', boldText: 'boldText', textAlign: 'textAlign', stopAnimations: 'stopAnimations',
  muteMedia: 'muteMedia', hideImages: 'hideImages', lowTransparency: 'lowTransparency', readingGuide: 'readingGuide',
  readingMask: 'readingMask', bigCursor: 'bigCursor', keyboardNav: 'keyboardNav',
};

const ENUMS: Partial<Record<keyof A11ySettings, readonly string[]>> = {
  contrast: ['off', 'blackYellow', 'light'], saturation: ['off', 'low', 'mono'], textAlign: ['off', 'start', 'center'],
};

/** קריאה בטוחה ממה שנשמר (localStorage): כל ערך לא תקין חוזר לברירת המחדל. */
export function sanitizeSettings(raw: unknown, fontSteps: number): A11ySettings {
  const out: A11ySettings = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const r = raw as Record<string, unknown>;
  for (const k of Object.keys(DEFAULT_SETTINGS) as (keyof A11ySettings)[]) {
    const v = r[k], d = DEFAULT_SETTINGS[k];
    if (typeof d === 'boolean') { if (typeof v === 'boolean') (out as unknown as Record<string, unknown>)[k] = v; }
    else if (typeof d === 'number') {
      const max = k === 'fontSize' ? fontSteps : LEVELS[k as keyof typeof LEVELS];
      if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max) (out as unknown as Record<string, unknown>)[k] = v;
    } else if (typeof v === 'string' && ENUMS[k]?.includes(v)) (out as unknown as Record<string, unknown>)[k] = v;
  }
  return out;
}

export const fontScaleFor = (t: Readonly<A11yTheme>, level: number) =>
  Math.round((t.fontScale.default + (level * (t.fontScale.max - t.fontScale.default)) / t.fontScale.steps) * 1000) / 1000;

/** זום לפאנל: עוקב אחרי הגדלת הטקסט עד panel.maxZoom (תיקון C1: אין גלישה ב־320). */
export const panelZoomFor = (t: Readonly<A11yTheme>, s: A11ySettings) => Math.min(Math.max(fontScaleFor(t, s.fontSize), 1), t.panel.maxZoom);

/** צבעי מצב בניגודיות גבוהה — המשמעות (שגיאה/הצלחה) נשמרת. ≥7:1 על הרקע של המצב. */
export const HIGH_CONTRAST_STATUS = {
  blackYellow: { danger: '#FF9E9E', success: '#7DF0FF' },
  light: { danger: '#A3001B', success: '#005A70' },
} as const;

export const ROOT_ID = 'ca11y-root';
const P = `body > :not(#${ROOT_ID}):not(script):not(style)`;
const ALL = `${P}, ${P} *`;
const SAFE_URL = /^\/[a-zA-Z0-9/_.-]{0,120}$|^\.{0,2}\/?[a-zA-Z0-9/_.-]{0,120}$/;

export function dyslexiaFontFace(fontBase: string): string {
  if (!SAFE_URL.test(fontBase) || fontBase.includes('//')) throw new Error('fontBase must be a same-origin path');
  const base = fontBase.replace(/\/$/, '');
  return ['hebrew', 'latin'].flatMap((sub) => [400, 700].map((w) =>
    `@font-face{font-family:"CoreA11yAlef";font-style:normal;font-weight:${w};font-display:swap;src:url("${base}/alef-${sub}-${w}-normal.woff2") format("woff2");unicode-range:${sub === 'hebrew' ? 'U+0590-05FF,U+200C-2010,U+20AA,U+25CC,U+FB1D-FB4F' : 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'};}`)).join('\n');
}

const CURSOR = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='48' viewBox='0 0 24 24'%3E%3Cpath d='M4 2l16 10-7 1.5L9.5 21z' fill='%23000' stroke='%23fff' stroke-width='1.5'/%3E%3C/svg%3E") 4 2, auto`;

export function buildEffectsCss(s: A11ySettings, t: Readonly<A11yTheme>, opts: { fontBase: string }): string {
  const parts: string[] = [];
  const motion = `${ALL}, ${P} *::before, ${P} *::after{animation-duration:.001ms !important;animation-iteration-count:1 !important;transition-duration:.001ms !important;scroll-behavior:auto !important;}`;
  parts.push(`@media (prefers-reduced-motion: reduce){${motion}}`); // מערכת ההפעלה — תמיד
  if (s.stopAnimations) parts.push(motion);
  const scale = fontScaleFor(t, s.fontSize);
  if (scale !== 1) parts.push(`html{font-size:${Math.round(scale * 1000) / 10}% !important;}`);
  if (s.lineHeight) parts.push(`${ALL}{line-height:${LH[s.lineHeight]} !important;}`);
  if (s.letterSpacing) parts.push(`${ALL}{letter-spacing:${LS[s.letterSpacing]}em !important;}`);
  if (s.wordSpacing) parts.push(`${ALL}{word-spacing:${WS[s.wordSpacing]}em !important;}`);
  if (s.dyslexiaFont) parts.push(dyslexiaFontFace(opts.fontBase), `${ALL}{font-family:"CoreA11yAlef", Arial, sans-serif !important;}`);
  else if (s.readableFont) parts.push(`${ALL}{font-family:Arial, "Helvetica Neue", system-ui, sans-serif !important;}`);
  if (s.boldText) parts.push(`${ALL}{font-weight:700 !important;}`);
  if (s.textAlign !== 'off') parts.push(`${P} :is(p,li,h1,h2,h3,h4,h5,h6,label,td,th,div,span){text-align:${s.textAlign} !important;}`);
  if (s.contrast !== 'off') {
    // ניגודיות אמיתית: משטח מלא בפלטה (לא filter), כל הטקסט/גבולות בצבע אחד, קישורים ופוקוס ייעודיים
    const hc = t.highContrast[s.contrast], st = HIGH_CONTRAST_STATUS[s.contrast];
    parts.push(`html, body{background:${hc.bg} !important;color:${hc.fg} !important;}
${ALL}{background-color:${hc.bg} !important;background-image:none !important;color:${hc.fg} !important;border-color:${hc.fg} !important;box-shadow:none !important;text-shadow:none !important;backdrop-filter:none !important;-webkit-backdrop-filter:none !important;}
${P} :is(a, a *){color:${hc.link} !important;text-decoration:underline !important;}
${P} :is(button,[role="button"],input,select,textarea){border:2px solid ${hc.fg} !important;}
${P} :is(svg, svg *){fill:currentColor;stroke:currentColor;}
${P} :focus-visible{outline:3px solid ${hc.focus} !important;outline-offset:2px !important;}
${P} :is([role="alert"],[aria-invalid="true"],[data-a11y-status="danger"]){color:${st.danger} !important;border-color:${st.danger} !important;}
${P} [data-a11y-status="success"]{color:${st.success} !important;border-color:${st.success} !important;}
${P} :is(img,video,picture){background-color:transparent !important;}`);
  }
  if (s.saturation !== 'off') parts.push(`${P}{filter:${s.saturation === 'low' ? 'saturate(.5)' : 'grayscale(1)'} !important;}`);
  if (s.highlightLinks) parts.push(`${P} a[href]{outline:2px dashed ${t.colors.focus} !important;outline-offset:2px !important;}`);
  if (s.underlineLinks || s.highlightLinks) parts.push(`${P} a[href]{text-decoration:underline !important;text-underline-offset:3px !important;}`);
  if (s.highlightHeadings) parts.push(`${P} :is(h1,h2,h3,h4,h5,h6,[role="heading"]){outline:2px solid ${t.colors.focus} !important;outline-offset:3px !important;}`);
  if (s.highlightFocus || s.keyboardNav) parts.push(`${P} :focus-visible, ${P} :focus{outline:3px solid ${t.colors.focus} !important;outline-offset:2px !important;box-shadow:0 0 0 6px rgba(0,0,0,.65) !important;}`);
  if (s.hideImages) parts.push(`${P} :is(img,picture,video,[role="img"]), ${P} [style*="background-image"]{visibility:hidden !important;background-image:none !important;}`);
  if (s.lowTransparency) parts.push(`${ALL}{backdrop-filter:none !important;-webkit-backdrop-filter:none !important;}`);
  if (s.bigCursor) parts.push(`${ALL}{cursor:${CURSOR} !important;}`);
  return parts.join('\n');
}

/* ---------- DOM passes ---------- */
const MEDIA_FLAG = 'data-ca11y-muted';
/** השתקה אמיתית (muted + pause לניגון אוטומטי). המדיה נשארת גלויה וזמינה. */
export function applyMediaMute(doc: Document, on: boolean): void {
  for (const m of Array.from(doc.querySelectorAll<HTMLMediaElement>('video, audio'))) {
    if (m.closest(`#${ROOT_ID}`)) continue;
    if (on && !m.hasAttribute(MEDIA_FLAG)) { m.setAttribute(MEDIA_FLAG, m.muted ? '1' : '0'); m.muted = true; if (m.autoplay) try { m.pause(); } catch { /* jsdom */ } }
    if (!on && m.hasAttribute(MEDIA_FLAG)) { m.muted = m.getAttribute(MEDIA_FLAG) === '1'; m.removeAttribute(MEDIA_FLAG); }
  }
}

const TRANS_FLAG = 'data-ca11y-opaque';
const RGBA = /rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/;
/**
 * הפחתת שקיפות אמיתית: רקע rgba חצי־שקוף ממוזג על צבע הרקע של המוצר ⇒ צבע אטום באותו גוון.
 * (לא opacity גורף.) הפיך: הערך המקורי נשמר ומשוחזר.
 */
export function applyOpaque(doc: Document, on: boolean, base: string): void {
  const view = doc.defaultView; if (!view) return;
  if (!on) {
    for (const el of Array.from(doc.querySelectorAll<HTMLElement>(`[${TRANS_FLAG}]`))) {
      el.style.backgroundColor = el.getAttribute(TRANS_FLAG) || ''; el.removeAttribute(TRANS_FLAG);
    }
    return;
  }
  const b = base.replace('#', ''), br = parseInt(b.slice(0, 2), 16), bg = parseInt(b.slice(2, 4), 16), bb = parseInt(b.slice(4, 6), 16);
  for (const el of Array.from(doc.querySelectorAll<HTMLElement>('body *'))) {
    if (el.closest(`#${ROOT_ID}`) || el.hasAttribute(TRANS_FLAG)) continue;
    const m = RGBA.exec(view.getComputedStyle(el).backgroundColor);
    if (!m) continue;
    const a = Number(m[4]); if (!(a > 0.02 && a < 0.98)) continue;
    const mix = (c: number, d: number) => Math.round(c * a + d * (1 - a));
    el.setAttribute(TRANS_FLAG, el.style.backgroundColor || '');
    el.style.backgroundColor = `rgb(${mix(Number(m[1]), br)}, ${mix(Number(m[2]), bg)}, ${mix(Number(m[3]), bb)})`;
  }
}

/** Alt/Option+<אות> לפי המקש הפיזי (e.code) — ב־Mac Option+A נותן 'å', בפריסה עברית 'ש'. */
export function isAltShortcut(e: Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'metaKey' | 'code' | 'key'>, letter: 'a' | 'r'): boolean {
  if (!e.altKey || e.ctrlKey || e.metaKey) return false;
  if (e.code) return e.code === `Key${letter.toUpperCase()}`;
  const heb = { a: 'ש', r: 'ר' }[letter];
  return e.key.toLowerCase() === letter || e.key === heb;
}

export function activeCount(s: A11ySettings): number {
  return (Object.keys(DEFAULT_SETTINGS) as (keyof A11ySettings)[]).filter((k) => s[k] !== DEFAULT_SETTINGS[k]).length;
}
