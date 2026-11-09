/**
 * @core/a11y-kit — ערכת נושא לווידג'ט נגישות, ניתנת להחלפה לכל פרויקט ולכל לקוח פרטי.
 * defineA11yTheme() בודק טוקנים + ניגודיות (זורק), applyConsoleOverrides() מחיל שינויים מהקונסולה
 * ודוחה כל שינוי שמפיל ניגודיות או מכבה את רצפת החובה (לא זורק — מחזיר rejected).
 */

export type Hex = `#${string}`;
export type Dir = 'rtl' | 'ltr';

export const FEATURES = [
  'fontSize', 'zoomLevel', 'lineHeight', 'letterSpacing', 'wordSpacing', 'contentSpacing',
  'readableFont', 'dyslexiaFont', 'boldText', 'textAlign',
  'contrast', 'saturation', 'highlightLinks', 'underlineLinks', 'highlightHeadings', 'highlightFocus',
  'readingGuide', 'readingMask', 'readingMode', 'pageStructure', 'bigCursor',
  'textToSpeech', 'clickToSpeak', 'muteMedia', 'stopAnimations', 'hideImages', 'lowTransparency',
  'keyboardNav', 'screenReaderHints', 'statement',
] as const;
export type Feature = (typeof FEATURES)[number];

/** רצפת חובה (ת"י 5568 / WCAG AA): תמיד פעילה, הקונסולה לא יכולה לכבות. תואם fail-open של gating. */
export const LEGAL_FLOOR: readonly Feature[] = ['keyboardNav', 'highlightFocus', 'fontSize', 'contrast', 'stopAnimations', 'statement'];

export interface A11yColors {
  bg: Hex; surface: Hex; fg: Hex; fgMuted: Hex;
  primary: Hex; onPrimary: Hex; focus: Hex; link: Hex; danger: Hex;
}
export interface HighContrastPalette { bg: Hex; fg: Hex; link: Hex; focus: Hex }
export interface A11yTheme {
  id: string;
  colors: A11yColors;
  highContrast: { blackYellow: HighContrastPalette; light: HighContrastPalette };
  fonts: { body: string; heading: string; dyslexia: string };
  radius: { sm: number; md: number; lg: number; pill: number };
  spacing: { unit: number; panelPadding: number; tileGap: number };
  dir: Dir;
  lang: string;
  fontScale: { default: number; min: number; max: number; steps: number };
  panel: { side: 'start' | 'end'; maxWidth: number; maxZoom: number };
  /** כפתור צף: גודל (≥44 יעד מגע) ומרווח מהשוליים. */
  fab: { size: number; gap: number };
  /** משטח זכוכית (שקיפות + טשטוש) — מבוטל אוטומטית ב'הפחתת שקיפות' ובניגודיות גבוהה. */
  glass: boolean;
  features: Feature[];
}

type DeepPartial<T> = { [K in keyof T]?: T[K] extends (infer U)[] ? U[] : T[K] extends object ? DeepPartial<T[K]> : T[K] };
export type A11yThemeInput = DeepPartial<A11yTheme> & { id: string };

export const DEFAULT_THEME: Omit<A11yTheme, 'id'> = {
  colors: {
    bg: '#0B1020', surface: '#161C30', fg: '#F4F6FB', fgMuted: '#B8C0D6',
    primary: '#6D5DF6', onPrimary: '#FFFFFF', focus: '#FFD166', link: '#9CC3FF', danger: '#FF8A80',
  },
  highContrast: {
    blackYellow: { bg: '#000000', fg: '#FFE600', link: '#7FDBFF', focus: '#FFFFFF' },
    light: { bg: '#FFFFFF', fg: '#000000', link: '#0033CC', focus: '#B00020' },
  },
  fonts: {
    body: '"Heebo", "Assistant", system-ui, sans-serif',
    heading: '"Heebo", "Assistant", system-ui, sans-serif',
    dyslexia: '"Alef", "Arial", sans-serif',
  },
  radius: { sm: 8, md: 14, lg: 20, pill: 999 },
  spacing: { unit: 4, panelPadding: 16, tileGap: 8 },
  dir: 'rtl',
  lang: 'he',
  fontScale: { default: 1, min: 1, max: 1.6, steps: 4 },
  panel: { side: 'end', maxWidth: 380, maxZoom: 1.25 },
  fab: { size: 56, gap: 16 },
  glass: false,
  features: [...FEATURES],
};

/* ---------- contrast (WCAG 2.x) ---------- */
const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
export const isHex = (v: unknown): v is Hex => typeof v === 'string' && HEX_RE.test(v);
function expand(hex: string): string {
  const h = hex.slice(1);
  return h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
}
export function luminance(hex: string): number {
  const h = expand(hex);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrastRatio(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number];
  return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100;
}

/** זוגות שנבדקים, והסף לכל אחד. */
export const CONTRAST_RULES: ReadonlyArray<{ fg: keyof A11yColors; bg: keyof A11yColors; min: number; why: string }> = [
  { fg: 'fg', bg: 'bg', min: 4.5, why: 'טקסט על רקע' },
  { fg: 'fg', bg: 'surface', min: 4.5, why: 'טקסט על כרטיס' },
  { fg: 'fgMuted', bg: 'surface', min: 4.5, why: 'טקסט משני על כרטיס' },
  { fg: 'onPrimary', bg: 'primary', min: 4.5, why: 'טקסט על כפתור ראשי' },
  { fg: 'link', bg: 'surface', min: 4.5, why: 'קישור' },
  { fg: 'focus', bg: 'bg', min: 3, why: 'טבעת פוקוס (רכיב UI)' },
  { fg: 'focus', bg: 'surface', min: 3, why: 'טבעת פוקוס על כרטיס' },
  { fg: 'danger', bg: 'surface', min: 4.5, why: 'טקסט שגיאה' },
];
export const HC_MIN = 7;

export interface ThemeIssue { path: string; reason: string }
export class A11yThemeError extends Error {
  constructor(public issues: ThemeIssue[]) {
    super('a11y theme invalid: ' + issues.map((i) => `${i.path}: ${i.reason}`).join('; '));
    this.name = 'A11yThemeError';
  }
}

const FONT_PART_RE = /^(?:[\p{L}\p{N} "'_-]{1,80}|var\(--[a-zA-Z0-9_-]{1,60}\))$/u;
/** font-family: רשימת שמות, או var(--x) של גופן שהמארח מאחסן בעצמו (next/font). בלי url() ובלי שירות חיצוני. */
const fontOk = (v: string) => v.length <= 240 && v.split(',').every((p) => FONT_PART_RE.test(p.trim()));
const inRange = (v: number, lo: number, hi: number) => Number.isFinite(v) && v >= lo && v <= hi;

export function validateTheme(t: A11yTheme): ThemeIssue[] {
  const out: ThemeIssue[] = [];
  if (!/^[a-z][a-z0-9-]{0,62}$/.test(t.id)) out.push({ path: 'id', reason: 'מזהה: אותיות קטנות, ספרות ומקף' });
  for (const [k, v] of Object.entries(t.colors)) if (!isHex(v)) out.push({ path: `colors.${k}`, reason: 'צבע חייב להיות #RGB או #RRGGBB' });
  for (const [name, p] of Object.entries(t.highContrast)) {
    for (const [k, v] of Object.entries(p)) if (!isHex(v)) out.push({ path: `highContrast.${name}.${k}`, reason: 'צבע לא תקין' });
  }
  // אין טעם לבדוק ניגודיות על צבעים שבורים
  const colorsOk = out.every((i) => !i.path.startsWith('colors.') && !i.path.startsWith('highContrast.'));
  if (colorsOk) for (const r of CONTRAST_RULES) {
    const c = contrastRatio(t.colors[r.fg], t.colors[r.bg]);
    if (c < r.min) out.push({ path: `colors.${r.fg}/${r.bg}`, reason: `ניגודיות ${c}:1 < ${r.min}:1 (${r.why})` });
  }
  if (colorsOk) for (const [name, p] of Object.entries(t.highContrast)) {
    for (const k of ['fg', 'link', 'focus'] as const) {
      const c = contrastRatio(p[k], p.bg);
      if (c < HC_MIN) out.push({ path: `highContrast.${name}.${k}`, reason: `ניגודיות ${c}:1 < ${HC_MIN}:1 (מצב ניגודיות גבוהה)` });
    }
  }
  if (colorsOk && contrastRatio(t.highContrast.light.bg, '#FFFFFF') > 1.2) out.push({ path: 'highContrast.light.bg', reason: 'מצב "בהיר" חייב רקע בהיר' });
  for (const [k, v] of Object.entries(t.fonts)) if (!fontOk(v)) out.push({ path: `fonts.${k}`, reason: 'font-family לא תקין (תווים אסורים)' });
  for (const [k, v] of Object.entries(t.radius)) if (!inRange(v, 0, k === 'pill' ? 9999 : 48)) out.push({ path: `radius.${k}`, reason: 'רדיוס מחוץ לטווח' });
  if (!inRange(t.spacing.unit, 2, 8)) out.push({ path: 'spacing.unit', reason: 'יחידת ריווח 2–8px' });
  if (!inRange(t.spacing.panelPadding, 8, 32)) out.push({ path: 'spacing.panelPadding', reason: '8–32px' });
  if (!inRange(t.spacing.tileGap, 4, 24)) out.push({ path: 'spacing.tileGap', reason: '4–24px' });
  if (t.dir !== 'rtl' && t.dir !== 'ltr') out.push({ path: 'dir', reason: 'rtl או ltr' });
  if (!/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(t.lang)) out.push({ path: 'lang', reason: 'BCP-47' });
  const fs = t.fontScale;
  if (!inRange(fs.min, 1, 1) ) out.push({ path: 'fontScale.min', reason: 'מינימום חייב להיות 1 (אסור להקטין מתחת לברירת המחדל)' });
  if (!inRange(fs.max, 1.32, 2)) out.push({ path: 'fontScale.max', reason: 'מקסימום 1.32–2 (נדרש לפחות ×1.32)' });
  if (!inRange(fs.default, fs.min, fs.max)) out.push({ path: 'fontScale.default', reason: 'בין min ל-max' });
  if (!Number.isInteger(fs.steps) || !inRange(fs.steps, 2, 8)) out.push({ path: 'fontScale.steps', reason: '2–8 שלבים' });
  if (!inRange(t.panel.maxWidth, 280, 480)) out.push({ path: 'panel.maxWidth', reason: '280–480px' });
  if (!inRange(t.panel.maxZoom, 1, 1.5)) out.push({ path: 'panel.maxZoom', reason: '1–1.5' });
  if (!inRange(t.fab.size, 44, 72)) out.push({ path: 'fab.size', reason: '44–72px (יעד מגע)' });
  if (!inRange(t.fab.gap, 8, 32)) out.push({ path: 'fab.gap', reason: '8–32px' });
  if (typeof t.glass !== 'boolean') out.push({ path: 'glass', reason: 'true/false' });
  const unknown = t.features.filter((f) => !(FEATURES as readonly string[]).includes(f));
  if (unknown.length) out.push({ path: 'features', reason: `לא מוכרים: ${unknown.join(', ')}` });
  return out;
}

function merge<T>(base: T, over: unknown): T {
  if (over === undefined) return base;
  if (Array.isArray(base) || typeof base !== 'object' || base === null) return over as T;
  if (typeof over !== 'object' || over === null || Array.isArray(over)) return over as T;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(over)) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    if (!(k in out)) continue; // מפתחות לא מוכרים נזרקים
    out[k] = merge(out[k], v);
  }
  return out as T;
}

function withFloor(features: Feature[]): Feature[] {
  return [...new Set<Feature>([...features, ...LEGAL_FLOOR])].sort((a, b) => FEATURES.indexOf(a) - FEATURES.indexOf(b));
}

/** הגדרת ערכת נושא לפרויקט/לקוח. ממזג על DEFAULT_THEME (או על base), בודק, וזורק A11yThemeError אם לא תקין. */
export function defineA11yTheme(input: A11yThemeInput, base: Omit<A11yTheme, 'id'> = DEFAULT_THEME): Readonly<A11yTheme> {
  const t = merge<A11yTheme>({ ...structuredClone(base), id: input.id }, input);
  t.features = withFloor(t.features);
  const issues = validateTheme(t);
  if (issues.length) throw new A11yThemeError(issues);
  return Object.freeze(t);
}

/* ---------- console ---------- */
export type ConsoleField =
  | { key: string; label: string; kind: 'color'; path: `colors.${keyof A11yColors}` }
  | { key: string; label: string; kind: 'select'; path: string; options: ReadonlyArray<{ value: string | number; label: string }> }
  | { key: string; label: string; kind: 'number'; path: string; min: number; max: number; step: number }
  | { key: string; label: string; kind: 'features'; path: 'features'; locked: readonly Feature[] };

/** אפשרויות הקונסולה הבסיסיות (מה שלקוח פרטי יכול לשנות בלי מפתח). */
export const CONSOLE_FIELDS: readonly ConsoleField[] = [
  { key: 'primary', label: 'צבע ראשי', kind: 'color', path: 'colors.primary' },
  { key: 'onPrimary', label: 'טקסט על צבע ראשי', kind: 'color', path: 'colors.onPrimary' },
  { key: 'bg', label: 'רקע', kind: 'color', path: 'colors.bg' },
  { key: 'surface', label: 'רקע כרטיס', kind: 'color', path: 'colors.surface' },
  { key: 'fg', label: 'צבע טקסט', kind: 'color', path: 'colors.fg' },
  { key: 'focus', label: 'צבע פוקוס', kind: 'color', path: 'colors.focus' },
  { key: 'link', label: 'צבע קישור', kind: 'color', path: 'colors.link' },
  { key: 'fontBody', label: 'גופן', kind: 'select', path: 'fonts.body', options: [
    { value: '"Heebo", "Assistant", system-ui, sans-serif', label: 'Heebo' },
    { value: '"Assistant", system-ui, sans-serif', label: 'Assistant' },
    { value: '"Rubik", system-ui, sans-serif', label: 'Rubik' },
    { value: 'system-ui, sans-serif', label: 'גופן מערכת' },
  ] },
  { key: 'radius', label: 'עיגול פינות', kind: 'select', path: 'radius.md', options: [
    { value: 4, label: 'חד' }, { value: 14, label: 'רגיל' }, { value: 24, label: 'עגול' },
  ] },
  { key: 'tileGap', label: 'ריווח', kind: 'number', path: 'spacing.tileGap', min: 4, max: 24, step: 2 },
  { key: 'dir', label: 'כיוון', kind: 'select', path: 'dir', options: [{ value: 'rtl', label: 'ימין לשמאל' }, { value: 'ltr', label: 'שמאל לימין' }] },
  { key: 'side', label: 'צד הכפתור', kind: 'select', path: 'panel.side', options: [{ value: 'end', label: 'סוף השורה' }, { value: 'start', label: 'תחילת השורה' }] },
  { key: 'fontScaleDefault', label: 'גודל טקסט התחלתי', kind: 'number', path: 'fontScale.default', min: 1, max: 1.32, step: 0.08 },
  { key: 'features', label: 'כלים בתפריט', kind: 'features', path: 'features', locked: LEGAL_FLOOR },
];

export type ConsoleOverrides = Partial<Record<string, unknown>>;
export interface ConsoleResult { theme: Readonly<A11yTheme>; applied: string[]; rejected: Array<{ key: string; reason: string }> }

function setPath(obj: Record<string, unknown>, path: string, value: unknown) {
  const parts = path.split('.');
  let cur = obj;
  for (const p of parts.slice(0, -1)) cur = cur[p] as Record<string, unknown>;
  cur[parts[parts.length - 1]!] = value;
}

/**
 * מחיל ערכים מהקונסולה אחד-אחד. כל ערך שנכשל (טיפוס/טווח/ניגודיות) נדחה ונשאר הערך הקודם;
 * ניסיון לכבות פיצ'ר מרצפת החובה מתועד ב-rejected והפיצ'ר נשאר פעיל.
 */
export function applyConsoleOverrides(theme: Readonly<A11yTheme>, overrides: ConsoleOverrides): ConsoleResult {
  let cur: A11yTheme = structuredClone(theme) as A11yTheme;
  const applied: string[] = [];
  const rejected: ConsoleResult['rejected'] = [];
  for (const [key, value] of Object.entries(overrides)) {
    const field = CONSOLE_FIELDS.find((f) => f.key === key);
    if (!field) { rejected.push({ key, reason: 'שדה לא קיים בקונסולה' }); continue; }
    let v: unknown = value;
    if (field.kind === 'color' && !isHex(v)) { rejected.push({ key, reason: 'צבע לא תקין' }); continue; }
    if (field.kind === 'select' && !field.options.some((o) => o.value === v)) { rejected.push({ key, reason: 'ערך לא ברשימה' }); continue; }
    if (field.kind === 'number' && (typeof v !== 'number' || !inRange(v, field.min, field.max))) { rejected.push({ key, reason: `מספר ${field.min}–${field.max}` }); continue; }
    if (field.kind === 'features') {
      if (!Array.isArray(v)) { rejected.push({ key, reason: 'רשימה' }); continue; }
      const dropped = LEGAL_FLOOR.filter((f) => !(v as string[]).includes(f));
      if (dropped.length) rejected.push({ key: 'features', reason: `רצפת חובה — נשארים פעילים: ${dropped.join(', ')}` });
      v = withFloor((v as string[]).filter((f): f is Feature => (FEATURES as readonly string[]).includes(f)));
    }
    const next = structuredClone(cur);
    setPath(next as unknown as Record<string, unknown>, field.path, v);
    const issues = validateTheme(next);
    if (issues.length) { rejected.push({ key, reason: issues.map((i) => i.reason).join('; ') }); continue; }
    cur = next;
    applied.push(key);
  }
  return { theme: Object.freeze(cur), applied, rejected };
}

/* ---------- output ---------- */
/** משתני CSS (`--a11y-*`) לשימוש בווידג'ט ובאתר המארח. */
export function themeToCssVars(t: Readonly<A11yTheme>): Record<string, string> {
  const kebab = (s: string) => s.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
  const v: Record<string, string> = {};
  for (const [k, c] of Object.entries(t.colors)) v[`--a11y-${kebab(k)}`] = c;
  for (const [n, p] of Object.entries(t.highContrast)) for (const [k, c] of Object.entries(p)) v[`--a11y-hc-${kebab(n)}-${k}`] = c;
  for (const [k, f] of Object.entries(t.fonts)) v[`--a11y-font-${k}`] = f;
  for (const [k, r] of Object.entries(t.radius)) v[`--a11y-radius-${k}`] = `${r}px`;
  v['--a11y-space'] = `${t.spacing.unit}px`;
  v['--a11y-panel-padding'] = `${t.spacing.panelPadding}px`;
  v['--a11y-tile-gap'] = `${t.spacing.tileGap}px`;
  v['--a11y-panel-max-width'] = `${t.panel.maxWidth}px`;
  v['--a11y-panel-max-zoom'] = String(t.panel.maxZoom);
  v['--a11y-font-scale'] = String(t.fontScale.default);
  v['--a11y-fab-size'] = `${t.fab.size}px`;
  v['--a11y-fab-gap'] = `${t.fab.gap}px`;
  return v;
}

const SELECTOR_RE = /^[a-zA-Z0-9#.\-_:\[\]="' ]{1,120}$/;
export function themeToCss(t: Readonly<A11yTheme>, selector = ':root'): string {
  if (!SELECTOR_RE.test(selector) || /[{};<>]/.test(selector)) throw new Error('invalid selector');
  const body = Object.entries(themeToCssVars(t)).map(([k, v]) => `  ${k}: ${v};`).join('\n');
  return `${selector} {\n${body}\n}`;
}

/** zoom של הפאנל: עוקב אחר גודל הטקסט עד panel.maxZoom, כדי שהפאנל לא יגלוש ב-320px. */
export const panelZoom = (t: Readonly<A11yTheme>, fontScale: number) => Math.min(Math.max(fontScale, 1), t.panel.maxZoom);

/** רשימת הכלים שבפועל מוצגים: features של הערכה ∩ מה שה-gating מאפשר, ורצפת החובה תמיד. */
export function effectiveFeatures(t: Readonly<A11yTheme>, gate?: (f: Feature) => boolean): Feature[] {
  const allowed = (f: Feature) => { try { return gate ? gate(f) !== false : true; } catch { return true; } }; // fail-open
  return withFloor(t.features.filter(allowed));
}
