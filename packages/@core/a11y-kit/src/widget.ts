/**
 * ווידג'ט נגישות ל־web, בלי תלות במסגרת (React/Next/סטטי): mountA11yWidget({ theme }) ⇒ handle.
 * כפתור צף עגול בתחילת השורה + גיליון תחתון (role=dialog, לא דיאלוג מקורי של הדפדפן) שנסגר בגרירה למטה,
 * ב־Esc, בכפתור סגירה ובלחיצה על הרקע. כל הטקסט בעברית, בלשון יחיד/ניטרלית.
 * מקורות: Maaser PR #6 (C1) + סקירה — ראו README.he.md לטבלת ההתאמה.
 */
import { effectiveFeatures, themeToCssVars, type A11yTheme, type Feature } from './core.ts';
import {
  DEFAULT_SETTINGS, LEVELS, ROOT_ID, SETTING_FEATURE, activeCount, applyMediaMute, applyOpaque, buildEffectsCss,
  isAltShortcut, panelZoomFor, sanitizeSettings, type A11ySettings,
} from './effects.ts';
import { DEFAULT_AVOID, collectObstacles, fabReserve, liftToClear } from './safe-area.ts';
import { swipeToDismiss } from './swipe.ts';

export interface MountOptions {
  theme: Readonly<A11yTheme>;
  doc?: Document;
  /** מפתח localStorage; ברירת מחדל core-a11y:v1:<theme.id> */
  storageKey?: string;
  /** נתיב יחסי באותו מקור שבו המארח מגיש את assets/fonts (Alef). */
  fontBase?: string;
  /** קישור להצהרת הנגישות של המוצר (נתיב פנימי). */
  statementHref?: string;
  /** gating מהקונסולה; fail-open, ורצפת החובה תמיד מוצגת. */
  gate?: (f: Feature) => boolean;
  /** סלקטור למכשולים שהכפתור הצף חייב לעקוף (בנוסף לסרגלים קבועים בתחתית). */
  avoid?: string;
  onChange?: (s: Readonly<A11ySettings>) => void;
}

export interface A11yWidgetHandle {
  readonly root: HTMLElement;
  open(): void; close(): void; reset(): void; isOpen(): boolean;
  get(): Readonly<A11ySettings>; set(p: Partial<A11ySettings>): void;
  /** מחשב מחדש את מיקום הכפתור הצף (למשל אחרי ניווט ב־SPA). */
  relayout(): void;
  destroy(): void;
}

type Attrs = Record<string, string | boolean | undefined>;
function h<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, attrs: Attrs = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] {
  const el = doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (v === false || v === undefined) continue; el.setAttribute(k, v === true ? '' : v); }
  for (const c of kids) el.append(typeof c === 'string' ? doc.createTextNode(c) : c);
  return el;
}

const ICON_A11Y = '<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false"><circle cx="12" cy="4.2" r="2.2" fill="currentColor"/><path d="M4 8.2c2.6.8 5.3 1.2 8 1.2s5.4-.4 8-1.2l.5 1.9c-2 .6-4.1 1-6.2 1.2v3.1l2.3 7.1-1.9.6L12.6 16h-1.2l-2.1 6.1-1.9-.6 2.3-7.1v-3.1c-2.1-.2-4.2-.6-6.2-1.2z" fill="currentColor"/></svg>';
const ICON_X = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';

const levelText = (v: number, n: number) => (v === 0 ? 'רגיל' : `רמה ${v} מתוך ${n}`);
const activeLabel = (n: number) => (n === 0 ? '' : n === 1 ? ', התאמה פעילה אחת' : `, ${n} התאמות פעילות`);

function panelCss(t: Readonly<A11yTheme>): string {
  const R = `#${ROOT_ID}`;
  const side = t.panel.side === 'start' ? 'inset-inline-start' : 'inset-inline-end';
  return `
${R}{all:initial;position:static;direction:${t.dir};font-family:var(--a11y-font-body);color:var(--a11y-fg);}
${R} *, ${R} *::before, ${R} *::after{box-sizing:border-box;font-family:inherit;letter-spacing:normal;word-spacing:normal;line-height:1.45;text-align:start;}
${R} .ca11y-sr{position:absolute !important;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;}
${R} .ca11y-fab{position:fixed;z-index:2147483600;${side}:calc(var(--a11y-fab-gap) + env(safe-area-inset-${t.panel.side === 'start' ? (t.dir === 'rtl' ? 'right' : 'left') : (t.dir === 'rtl' ? 'left' : 'right')}, 0px));
  bottom:calc(var(--a11y-fab-gap) + env(safe-area-inset-bottom, 0px) + var(--ca11y-lift, 0px));
  width:var(--a11y-fab-size);height:var(--a11y-fab-size);border-radius:50%;border:2px solid color-mix(in srgb, var(--a11y-on-primary) 35%, transparent);
  background:var(--a11y-primary);color:var(--a11y-on-primary);display:grid;place-items:center;cursor:pointer;padding:0;
  box-shadow:0 8px 24px rgba(0,0,0,.35);transition:bottom .2s ease;}
${R} .ca11y-fab:focus-visible, ${R} button:focus-visible, ${R} a:focus-visible{outline:3px solid var(--a11y-focus);outline-offset:3px;}
${R} .ca11y-badge{position:absolute;top:-4px;inset-inline-end:-4px;min-width:22px;height:22px;border-radius:11px;padding:0 6px;font-size:13px;font-weight:700;
  background:var(--a11y-fg);color:var(--a11y-bg);display:grid;place-items:center;}
${R} .ca11y-backdrop{position:fixed;inset:0;z-index:2147483601;background:rgba(0,0,0,.55);}
${R} .ca11y-sheet{position:fixed;z-index:2147483602;bottom:0;${side}:0;zoom:var(--ca11y-zoom,1);
  width:min(var(--a11y-panel-max-width), calc(100vw / var(--ca11y-zoom,1)));max-height:calc(88dvh / var(--ca11y-zoom,1));
  display:flex;flex-direction:column;background:var(--a11y-surface);color:var(--a11y-fg);
  border-radius:var(--a11y-radius-lg) var(--a11y-radius-lg) 0 0;box-shadow:0 -10px 40px rgba(0,0,0,.45);font-size:16px;overflow:hidden;
  border:1px solid color-mix(in srgb, var(--a11y-fg) 14%, transparent);border-bottom:0;}
${R}[data-glass] .ca11y-sheet{background:color-mix(in srgb, var(--a11y-surface) 93%, transparent);backdrop-filter:blur(18px) saturate(1.2);-webkit-backdrop-filter:blur(18px) saturate(1.2);}
@media (min-width: 720px){${R} .ca11y-sheet{bottom:var(--a11y-fab-gap);${side}:var(--a11y-fab-gap);border-radius:var(--a11y-radius-lg);border-bottom:1px solid color-mix(in srgb, var(--a11y-fg) 14%, transparent);}}
${R} [hidden]{display:none !important;}
${R} .ca11y-handle{display:block;width:100%;height:28px;padding:0;margin:0;border:0;background:transparent;cursor:grab;touch-action:none;}
${R} .ca11y-handle span{display:block;margin:10px auto 0;width:44px;height:5px;border-radius:3px;background:var(--a11y-fg-muted);}
${R} .ca11y-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 var(--a11y-panel-padding) 8px;touch-action:none;}
${R} .ca11y-head h2{margin:0;font-family:var(--a11y-font-heading);font-size:20px;font-weight:700;color:var(--a11y-fg);}
${R} .ca11y-iconbtn{width:44px;height:44px;border-radius:50%;border:1px solid color-mix(in srgb, var(--a11y-fg) 25%, transparent);background:transparent;color:var(--a11y-fg);display:grid;place-items:center;cursor:pointer;padding:0;}
${R} .ca11y-body{overflow:auto;overscroll-behavior:contain;padding:0 var(--a11y-panel-padding) 8px;flex:1 1 auto;}
${R} .ca11y-sec{border-top:1px solid color-mix(in srgb, var(--a11y-fg) 14%, transparent);}
${R} .ca11y-sec h3{margin:0;font-size:inherit;}
${R} .ca11y-acc{width:100%;min-height:52px;display:flex;align-items:center;justify-content:space-between;gap:8px;background:transparent;border:0;color:var(--a11y-fg);font-size:17px;font-weight:700;cursor:pointer;padding:4px 2px;font-family:var(--a11y-font-heading);}
${R} .ca11y-acc .ca11y-chev{transition:transform .2s;}
${R} .ca11y-acc[aria-expanded="true"] .ca11y-chev{transform:rotate(180deg);}
${R} .ca11y-items{display:grid;gap:var(--a11y-tile-gap);padding:2px 0 14px;}
${R} .ca11y-row{width:100%;min-height:48px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 12px;
  border-radius:var(--a11y-radius-md);border:1px solid color-mix(in srgb, var(--a11y-fg) 18%, transparent);background:color-mix(in srgb, var(--a11y-bg) 55%, var(--a11y-surface));
  color:var(--a11y-fg);font-size:16px;cursor:pointer;text-align:start;}
${R} .ca11y-row[aria-checked="true"], ${R} .ca11y-row[aria-pressed="true"]{border-color:var(--a11y-primary);box-shadow:inset 0 0 0 1px var(--a11y-primary);}
${R} .ca11y-track{flex:none;width:44px;height:26px;border-radius:13px;background:transparent;border:2px solid var(--a11y-fg-muted);position:relative;}
${R} .ca11y-track::after{content:"";position:absolute;top:3px;inset-inline-start:3px;width:16px;height:16px;border-radius:50%;background:var(--a11y-fg-muted);transition:inset-inline-start .15s;}
${R} [aria-checked="true"] .ca11y-track{background:var(--a11y-primary);border-color:var(--a11y-primary);}
${R} [aria-checked="true"] .ca11y-track::after{inset-inline-start:21px;background:var(--a11y-on-primary);}
${R} .ca11y-lvl{flex:none;font-size:14px;color:var(--a11y-fg-muted);}
${R} [aria-pressed="true"] .ca11y-lvl{color:var(--a11y-fg);font-weight:700;}
${R} .ca11y-field{display:grid;gap:6px;}
${R} .ca11y-label{font-size:15px;color:var(--a11y-fg-muted);}
${R} .ca11y-seg{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:4px;padding:4px;border-radius:var(--a11y-radius-md);background:color-mix(in srgb, var(--a11y-bg) 70%, var(--a11y-surface));border:1px solid color-mix(in srgb, var(--a11y-fg) 18%, transparent);}
${R} .ca11y-seg button{min-height:44px;border:0;border-radius:calc(var(--a11y-radius-md) - 4px);background:transparent;color:var(--a11y-fg);font-size:15px;cursor:pointer;padding:4px 6px;text-align:center;}
${R} .ca11y-seg button[aria-checked="true"]{background:var(--a11y-primary);color:var(--a11y-on-primary);font-weight:700;}
${R} .ca11y-step{display:flex;align-items:center;gap:8px;}
${R} .ca11y-step button{width:48px;height:48px;border-radius:var(--a11y-radius-md);border:1px solid color-mix(in srgb, var(--a11y-fg) 25%, transparent);background:color-mix(in srgb, var(--a11y-bg) 55%, var(--a11y-surface));color:var(--a11y-fg);font-size:22px;font-weight:700;cursor:pointer;}
${R} .ca11y-step button[aria-disabled="true"]{opacity:.55;cursor:not-allowed;}
${R} .ca11y-step output{flex:1;text-align:center;font-size:16px;}
${R} .ca11y-foot{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px 12px;padding:10px var(--a11y-panel-padding) calc(12px + env(safe-area-inset-bottom, 0px));border-top:1px solid color-mix(in srgb, var(--a11y-fg) 14%, transparent);}
${R} .ca11y-reset{min-height:44px;padding:0 16px;border-radius:var(--a11y-radius-pill);border:0;background:var(--a11y-primary);color:var(--a11y-on-primary);font-size:16px;font-weight:700;cursor:pointer;}
${R} .ca11y-foot a{color:var(--a11y-link);font-size:15px;text-decoration:underline;text-underline-offset:3px;min-height:44px;display:inline flex;align-items:center;}
${R} .ca11y-guide{position:fixed;inset-inline:0;height:12px;z-index:2147483599;pointer-events:none;background:var(--a11y-focus);opacity:.45;border-block:2px solid #000;}
${R} .ca11y-mask{position:fixed;inset-inline:0;z-index:2147483599;pointer-events:none;background:rgba(0,0,0,.6);}
@media (prefers-reduced-motion: reduce){${R} *{transition:none !important;animation:none !important;}}
`;
}

export function mountA11yWidget(o: MountOptions): A11yWidgetHandle {
  const doc = o.doc ?? document, win = doc.defaultView ?? window, t = o.theme;
  if (doc.getElementById(ROOT_ID)) throw new Error('a11y widget already mounted');
  const key = o.storageKey ?? `core-a11y:v1:${t.id}`;
  const fontBase = o.fontBase ?? '/a11y-fonts';
  const shown = new Set(effectiveFeatures(t, o.gate));
  const has = (k: keyof A11ySettings) => shown.has(SETTING_FEATURE[k]);
  let s: A11ySettings = (() => { try { return sanitizeSettings(JSON.parse(win.localStorage.getItem(key) ?? 'null'), t.fontScale.steps); } catch { return { ...DEFAULT_SETTINGS }; } })();
  const cleanups: (() => void)[] = [];
  const on = <E extends Event>(target: EventTarget, ev: string, fn: (e: E) => void, opt?: AddEventListenerOptions | boolean) => {
    target.addEventListener(ev, fn as EventListener, opt); cleanups.push(() => target.removeEventListener(ev, fn as EventListener, opt));
  };

  /* ---------- skeleton ---------- */
  const root = h(doc, 'div', { id: ROOT_ID, dir: t.dir, lang: t.lang, 'data-theme': t.id, 'data-glass': t.glass || undefined });
  for (const [k, v] of Object.entries(themeToCssVars(t))) root.style.setProperty(k, v);
  const css = h(doc, 'style', {}, panelCss(t));
  const fx = h(doc, 'style', { id: 'ca11y-effects' });
  const fab = h(doc, 'button', { type: 'button', class: 'ca11y-fab', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', 'aria-controls': 'ca11y-sheet' });
  fab.innerHTML = ICON_A11Y; // קבוע, לא קלט
  const badge = h(doc, 'span', { class: 'ca11y-badge', 'aria-hidden': 'true', hidden: true });
  fab.append(badge);
  const backdrop = h(doc, 'div', { class: 'ca11y-backdrop', hidden: true });
  const sheet = h(doc, 'div', { id: 'ca11y-sheet', class: 'ca11y-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ca11y-title', hidden: true });
  const handle = h(doc, 'button', { type: 'button', class: 'ca11y-handle', 'data-swipe-handle': '', 'aria-label': 'סגירה, אפשר גם לגרור למטה' }, h(doc, 'span', { 'aria-hidden': 'true' }));
  const closeBtn = h(doc, 'button', { type: 'button', class: 'ca11y-iconbtn', 'aria-label': 'סגירת תפריט הנגישות' });
  closeBtn.innerHTML = ICON_X;
  const head = h(doc, 'div', { class: 'ca11y-head' }, h(doc, 'h2', { id: 'ca11y-title' }, 'נגישות'), closeBtn);
  const body = h(doc, 'div', { class: 'ca11y-body' });
  const live = h(doc, 'div', { class: 'ca11y-sr', 'aria-live': 'polite', role: 'status' });
  const guide = h(doc, 'div', { class: 'ca11y-guide', 'aria-hidden': 'true', hidden: true });
  const maskTop = h(doc, 'div', { class: 'ca11y-mask', 'aria-hidden': 'true', hidden: true });
  const maskBot = h(doc, 'div', { class: 'ca11y-mask', 'aria-hidden': 'true', hidden: true });

  const sync: (() => void)[] = [];
  const announce = (msg: string) => { live.textContent = ''; win.setTimeout(() => { live.textContent = msg; }, 30); };
  const set = (p: Partial<A11ySettings>, msg?: string) => { s = { ...s, ...p }; persist(); applyAll(); if (msg) announce(msg); };

  /* ---------- controls ---------- */
  let uid = 0;
  const sw = (k: keyof A11ySettings, label: string) => {
    const b = h(doc, 'button', { type: 'button', class: 'ca11y-row', role: 'switch', 'aria-checked': 'false' }, h(doc, 'span', {}, label), h(doc, 'span', { class: 'ca11y-track', 'aria-hidden': 'true' }));
    // Space/Enter: הקליק המקורי של <button> בלבד — בלי מאזין keydown נוסף (תיקון "Space פעמיים")
    b.addEventListener('click', () => { const v = !s[k]; set({ [k]: v } as Partial<A11ySettings>, `${label}: ${v ? 'פועל' : 'כבוי'}`); });
    sync.push(() => b.setAttribute('aria-checked', String(!!s[k])));
    return b;
  };
  const cycle = (k: 'lineHeight' | 'letterSpacing' | 'wordSpacing', label: string) => {
    const n = LEVELS[k], lvl = h(doc, 'span', { class: 'ca11y-lvl' });
    const b = h(doc, 'button', { type: 'button', class: 'ca11y-row', 'aria-pressed': 'false' }, h(doc, 'span', {}, label + ' '), lvl);
    b.addEventListener('click', () => { const v = (s[k] + 1) % (n + 1); set({ [k]: v } as Partial<A11ySettings>, `${label}: ${levelText(v, n)}`); });
    sync.push(() => { b.setAttribute('aria-pressed', String(s[k] > 0)); lvl.textContent = levelText(s[k], n); });
    return b;
  };
  const seg = <K extends 'contrast' | 'saturation' | 'textAlign'>(k: K, label: string, opts: ReadonlyArray<[A11ySettings[K], string]>) => {
    const id = `ca11y-l${++uid}`;
    const group = h(doc, 'div', { class: 'ca11y-seg', role: 'radiogroup', 'aria-labelledby': id });
    const btns = opts.map(([v, text]) => {
      const b = h(doc, 'button', { type: 'button', role: 'radio', 'aria-checked': 'false', tabindex: '-1' }, text);
      b.addEventListener('click', () => set({ [k]: v } as Partial<A11ySettings>, `${label}: ${text}`));
      return b;
    });
    group.append(...btns);
    group.addEventListener('keydown', (e) => {
      const fwd = t.dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight', back = t.dir === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
      const i = opts.findIndex(([v]) => v === s[k]);
      let j = -1;
      if (e.key === fwd || e.key === 'ArrowDown') j = (i + 1) % opts.length;
      else if (e.key === back || e.key === 'ArrowUp') j = (i - 1 + opts.length) % opts.length;
      else if (e.key === 'Home') j = 0; else if (e.key === 'End') j = opts.length - 1;
      if (j < 0) return;
      e.preventDefault(); btns[j]!.click(); btns[j]!.focus();
    });
    sync.push(() => btns.forEach((b, i) => { const on = opts[i]![0] === s[k]; b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; }));
    return h(doc, 'div', { class: 'ca11y-field' }, h(doc, 'span', { id, class: 'ca11y-label' }, label), group);
  };
  const stepper = () => {
    const n = t.fontScale.steps, id = `ca11y-l${++uid}`;
    const minus = h(doc, 'button', { type: 'button', 'aria-label': 'הקטנת טקסט' }, '−');
    const plus = h(doc, 'button', { type: 'button', 'aria-label': 'הגדלת טקסט' }, '+');
    const out = h(doc, 'output', { 'aria-live': 'polite' });
    const go = (d: number) => { const v = Math.min(n, Math.max(0, s.fontSize + d)); if (v !== s.fontSize) set({ fontSize: v }); };
    minus.addEventListener('click', () => go(-1)); plus.addEventListener('click', () => go(1));
    sync.push(() => { out.textContent = `גודל טקסט: ${levelText(s.fontSize, n)}`; minus.setAttribute('aria-disabled', String(s.fontSize === 0)); plus.setAttribute('aria-disabled', String(s.fontSize === n)); });
    return h(doc, 'div', { class: 'ca11y-field' }, h(doc, 'span', { id, class: 'ca11y-label' }, 'גודל טקסט'),
      h(doc, 'div', { class: 'ca11y-step', role: 'group', 'aria-labelledby': id }, minus, out, plus));
  };
  const section = (title: string, items: (HTMLElement | null)[], open = false) => {
    const list = items.filter((x): x is HTMLElement => !!x);
    if (!list.length) return null;
    const id = `ca11y-s${++uid}`;
    const btn = h(doc, 'button', { type: 'button', class: 'ca11y-acc', 'aria-expanded': String(open), 'aria-controls': id }, h(doc, 'span', {}, title), h(doc, 'span', { class: 'ca11y-chev', 'aria-hidden': 'true' }, '▾'));
    const region = h(doc, 'div', { id, class: 'ca11y-items', hidden: !open }, ...list);
    btn.addEventListener('click', () => { const v = btn.getAttribute('aria-expanded') !== 'true'; btn.setAttribute('aria-expanded', String(v)); region.hidden = !v; });
    return h(doc, 'div', { class: 'ca11y-sec' }, h(doc, 'h3', {}, btn), region);
  };
  const side = t.dir === 'rtl' ? 'לימין' : 'לשמאל';
  const secs = [
    section('טקסט', [
      has('fontSize') ? stepper() : null,
      has('lineHeight') ? cycle('lineHeight', 'ריווח שורות') : null,
      has('letterSpacing') ? cycle('letterSpacing', 'ריווח אותיות') : null,
      has('wordSpacing') ? cycle('wordSpacing', 'ריווח מילים') : null,
      has('readableFont') ? sw('readableFont', 'גופן קריא') : null,
      has('dyslexiaFont') ? sw('dyslexiaFont', 'גופן ידידותי לדיסלקציה') : null,
      has('boldText') ? sw('boldText', 'טקסט מודגש') : null,
      has('textAlign') ? seg('textAlign', 'יישור טקסט', [['off', 'רגיל'], ['start', side], ['center', 'למרכז']]) : null,
    ], true),
    section('צבע וניגודיות', [
      has('contrast') ? seg('contrast', 'ניגודיות', [['off', 'רגילה'], ['blackYellow', 'שחור־צהוב'], ['light', 'בהירה']]) : null,
      has('saturation') ? seg('saturation', 'צבעים', [['off', 'רגילים'], ['low', 'מעומעמים'], ['mono', 'שחור־לבן']]) : null,
      has('highlightLinks') ? sw('highlightLinks', 'הדגשת קישורים') : null,
      has('underlineLinks') ? sw('underlineLinks', 'קו תחתון לקישורים') : null,
      has('highlightHeadings') ? sw('highlightHeadings', 'הדגשת כותרות') : null,
      has('lowTransparency') ? sw('lowTransparency', 'הפחתת שקיפות') : null,
    ]),
    section('ניווט וקריאה', [
      has('highlightFocus') ? sw('highlightFocus', 'סימון בולט למיקום המקלדת') : null,
      has('readingGuide') ? sw('readingGuide', 'סרגל קריאה') : null,
      has('readingMask') ? sw('readingMask', 'מסכת קריאה') : null,
      has('bigCursor') ? sw('bigCursor', 'סמן עכבר גדול') : null,
    ]),
    section('תנועה ומדיה', [
      has('stopAnimations') ? sw('stopAnimations', 'עצירת אנימציות') : null,
      has('muteMedia') ? sw('muteMedia', 'השתקת וידאו ושמע') : null,
      has('hideImages') ? sw('hideImages', 'הסתרת תמונות') : null,
    ]),
  ].filter((x): x is HTMLDivElement => !!x);
  body.append(...secs);
  const resetBtn = h(doc, 'button', { type: 'button', class: 'ca11y-reset' }, 'איפוס הכול');
  resetBtn.addEventListener('click', () => reset());
  const foot = h(doc, 'div', { class: 'ca11y-foot' }, resetBtn);
  if (o.statementHref && shown.has('statement')) {
    if (!/^\/[\w\-/.#?=&]*$/.test(o.statementHref)) throw new Error('statementHref must be a same-origin path');
    foot.append(h(doc, 'a', { href: o.statementHref }, 'הצהרת נגישות'));
  }
  sheet.append(handle, head, body, foot);
  root.append(css, fab, backdrop, sheet, guide, maskTop, maskBot, live);
  doc.head.append(fx);
  doc.body.append(root);

  /* ---------- safe area (root fix for FAB-over-button) ---------- */
  const res = fabReserve(t.fab.size, t.fab.gap);
  const html = doc.documentElement;
  html.style.setProperty('--a11y-fab-reserve-block', `${res.block}px`);
  html.style.setProperty('--a11y-fab-reserve-inline', `${res.inline}px`);
  html.setAttribute('data-a11y-fab-side', t.panel.side);
  let lift = 0, relayoutT = 0;
  const relayout = () => {
    if (!fab.isConnected) return;
    const r = fab.getBoundingClientRect();
    if (r.width < 1) return;
    const base = { left: r.left, right: r.right, top: r.top + lift, bottom: r.bottom + lift };
    const next = liftToClear(base, collectObstacles(doc, o.avoid ?? DEFAULT_AVOID, ROOT_ID), t.fab.gap, Math.round(win.innerHeight * 0.5));
    if (next !== lift) { lift = next; root.style.setProperty('--ca11y-lift', `${lift}px`); html.style.setProperty('--a11y-fab-lift', `${lift}px`); }
  };
  const schedule = () => { win.clearTimeout(relayoutT); relayoutT = win.setTimeout(relayout, 120); };
  on(win, 'resize', schedule); on(win, 'scroll', schedule, { passive: true });
  if (typeof win.MutationObserver === 'function') {
    const mo = new win.MutationObserver((recs) => { if (recs.some((r) => !root.contains(r.target))) schedule(); });
    mo.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
    // שינוי גודל טקסט/זום של המארח על <html> (class/style) משנה את הפריסה בלי resize
    mo.observe(html, { attributes: true, attributeFilter: ['class', 'style', 'lang', 'dir'] });
    cleanups.push(() => mo.disconnect());
  }
  if (typeof win.ResizeObserver === 'function') {
    const ro = new win.ResizeObserver(schedule); ro.observe(doc.body); cleanups.push(() => ro.disconnect());
  }

  /* ---------- reading guide / mask ---------- */
  let lastY = win.innerHeight / 2;
  const paintGuide = () => {
    guide.hidden = !s.readingGuide; maskTop.hidden = maskBot.hidden = !s.readingMask;
    if (s.readingGuide) guide.style.top = `${Math.max(0, lastY - 6)}px`;
    if (s.readingMask) { const band = 70; maskTop.style.top = '0'; maskTop.style.height = `${Math.max(0, lastY - band / 2)}px`; maskBot.style.top = `${lastY + band / 2}px`; maskBot.style.bottom = '0'; }
  };
  on<PointerEvent>(doc, 'pointermove', (e) => { if (s.readingGuide || s.readingMask) { lastY = e.clientY; paintGuide(); } }, { passive: true });

  /* ---------- apply ---------- */
  function applyAll() {
    fx.textContent = buildEffectsCss(s, t, { fontBase });
    applyMediaMute(doc, s.muteMedia);
    applyOpaque(doc, false, t.colors.bg);
    if (s.lowTransparency) applyOpaque(doc, true, t.colors.bg);
    const z = panelZoomFor(t, s);
    root.style.setProperty('--ca11y-zoom', String(z));
    // ניגודיות גבוהה גם בתוך הפאנל: הפלטה מחליפה את טוקני הערכה
    const hc = s.contrast === 'off' ? null : t.highContrast[s.contrast];
    const base = themeToCssVars(t);
    const vars: Record<string, string> = hc
      ? { '--a11y-bg': hc.bg, '--a11y-surface': hc.bg, '--a11y-fg': hc.fg, '--a11y-fg-muted': hc.fg, '--a11y-primary': hc.fg, '--a11y-on-primary': hc.bg, '--a11y-link': hc.link, '--a11y-focus': hc.focus }
      : {};
    for (const k of ['--a11y-bg', '--a11y-surface', '--a11y-fg', '--a11y-fg-muted', '--a11y-primary', '--a11y-on-primary', '--a11y-link', '--a11y-focus']) root.style.setProperty(k, vars[k] ?? base[k]!);
    root.toggleAttribute('data-glass', t.glass && !hc && !s.lowTransparency);
    root.toggleAttribute('data-hc', !!hc);
    const n = activeCount(s);
    badge.hidden = n === 0; badge.textContent = String(n);
    fab.setAttribute('aria-label', `תפריט נגישות${activeLabel(n)}`);
    html.toggleAttribute('data-a11y-active', n > 0);
    for (const f of sync) f();
    paintGuide();
    o.onChange?.(s);
  }
  function persist() { try { win.localStorage.setItem(key, JSON.stringify(s)); } catch { /* מצב פרטי */ } }

  /* ---------- open / close / focus ---------- */
  let trigger: HTMLElement | null = null, offSwipe: (() => void) | null = null;
  const focusables = () => Array.from(sheet.querySelectorAll<HTMLElement>('button, a[href], [tabindex]:not([tabindex="-1"])')).filter((el) => !el.closest('[hidden]') && el.tabIndex >= 0);
  const isOpen = () => !sheet.hidden;
  function open() {
    if (isOpen()) return;
    trigger = (doc.activeElement as HTMLElement | null) ?? fab;
    sheet.style.transform = ''; sheet.style.transition = ''; sheet.removeAttribute('data-swipe'); backdrop.style.backgroundColor = '';
    sheet.hidden = false; backdrop.hidden = false; fab.setAttribute('aria-expanded', 'true');
    offSwipe = swipeToDismiss({ sheet, backdrop, scroller: body, drag: '[data-swipe-handle], .ca11y-head', onDismiss: close });
    // ניסיונות חוזרים עד שהפוקוס באמת בפנים; עוצרים אם המשתמש הזיז בעצמו (תיקון C1)
    let tries = 0, moved = false;
    const mark = () => { moved = true; };
    sheet.addEventListener('pointerdown', mark, { once: true });
    const ensure = () => { if (moved || !isOpen() || sheet.contains(doc.activeElement)) return; closeBtn.focus(); if (++tries < 10) win.setTimeout(ensure, 50); };
    ensure();
  }
  function close() {
    if (!isOpen()) return;
    offSwipe?.(); offSwipe = null;
    sheet.hidden = true; backdrop.hidden = true; fab.setAttribute('aria-expanded', 'false');
    const back = trigger && doc.contains(trigger) ? trigger : fab;
    try { back.focus(); } catch { fab.focus(); }
    trigger = null;
  }
  function reset() { s = { ...DEFAULT_SETTINGS }; persist(); applyAll(); announce('כל ההתאמות אופסו'); }

  fab.addEventListener('click', () => (isOpen() ? close() : open()));
  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', close);
  on<KeyboardEvent>(doc, 'keydown', (e) => {
    if (isAltShortcut(e, 'a')) { e.preventDefault(); if (isOpen()) close(); else { open(); } return; }
    if (isAltShortcut(e, 'r')) { e.preventDefault(); reset(); return; }
    if (!isOpen()) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key === 'Tab') {
      const f = focusables(); if (!f.length) return;
      const first = f[0]!, last = f[f.length - 1]!, a = doc.activeElement;
      if (e.shiftKey && (a === first || !sheet.contains(a))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (a === last || !sheet.contains(a))) { e.preventDefault(); first.focus(); }
    }
  }, true);

  applyAll();
  win.setTimeout(relayout, 0);

  return {
    root, open, close, reset, isOpen, relayout,
    get: () => ({ ...s }),
    set: (p) => { s = sanitizeSettings({ ...s, ...p }, t.fontScale.steps); persist(); applyAll(); },
    destroy: () => {
      close();
      for (const c of cleanups.splice(0)) c();
      win.clearTimeout(relayoutT);
      applyMediaMute(doc, false); applyOpaque(doc, false, t.colors.bg);
      fx.remove(); root.remove();
      for (const p of ['--a11y-fab-reserve-block', '--a11y-fab-reserve-inline', '--a11y-fab-lift']) html.style.removeProperty(p);
      html.removeAttribute('data-a11y-fab-side'); html.removeAttribute('data-a11y-active');
    },
  };
}
