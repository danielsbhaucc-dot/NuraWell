'use client';

import Link from 'next/link';
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  Accessibility,
  ChevronDown,
  Eye,
  FileText,
  Focus,
  Heading,
  Map,
  Minus,
  MousePointer2,
  Palette,
  RotateCcw,
  Type,
  Underline,
  VolumeX,
  Wind,
  X,
  ZoomIn,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { countActiveAccessibilityPreferences } from '@/lib/a11y/count-active-preferences';
import type { FontScale, LineSpacing, SaturationLevel } from '@/lib/a11y/types';
import { useAccessibility } from './AccessibilityProvider';
import { A11Y_PANEL_OPEN_EVENT, setAccessibilityBannerAlt } from './a11y-panel-events';

type SectionKey = 'visual' | 'content' | 'navigation';

function FeatureTile({
  label,
  pressed,
  onToggle,
  icon,
}: {
  label: string;
  pressed: boolean;
  onToggle: () => void;
  icon: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onToggle}
      className={cn(
        'a11y-feature-tile flex flex-col items-center justify-center gap-1.5 rounded-xl border px-2 py-3 text-center transition-all',
        pressed
          ? 'border-primary-500/70 bg-linear-to-b from-primary-700 to-secondary-700 text-on-dark shadow-md'
          : 'border-on-dark/70 bg-background-card/75 text-ink-700 hover:border-primary-200 hover:bg-background-card',
      )}
    >
      <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg', pressed ? 'bg-background-card/15' : 'bg-primary-50 text-primary-700')} aria-hidden>
        {icon}
      </span>
      <span className="text-[10px] font-bold leading-tight">{label}</span>
    </button>
  );
}

function AccordionSection({
  id,
  title,
  open,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-on-dark/60 bg-background-card/35">
      <button
        type="button"
        id={`${id}-btn`}
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-start"
      >
        <span className="text-xs font-black text-ink-900">{title}</span>
        <ChevronDown className={cn('h-4 w-4 text-ink-500 transition-transform', open && '-rotate-180')} aria-hidden />
      </button>
      {open ? (
        <div id={`${id}-panel`} role="region" aria-labelledby={`${id}-btn`} className="space-y-2 border-t border-on-dark/50 px-3 pb-3 pt-2">
          {children}
        </div>
      ) : null}
    </div>
  );
}

function ScalePicker<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ key: T; label: string }>;
  onChange: (key: T) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-bold text-ink-700">{label}</p>
      <div className="grid grid-cols-3 gap-1.5" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.key}
            type="button"
            aria-pressed={value === option.key}
            onClick={() => onChange(option.key)}
            className={cn(
              'rounded-lg border px-2 py-2 text-[10px] font-bold transition-colors',
              value === option.key
                ? 'border-primary-600 bg-primary-700 text-on-dark'
                : 'border-on-dark/70 bg-background-card/70 text-ink-700 hover:bg-background-card',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function AccessibilityWidget() {
  const panelId = useId();
  const { preferences, setFontScale, setLineSpacing, setSaturation, toggle, hideWidget, resetPreferences, updatePreferences } =
    useAccessibility();

  const [open, setOpen] = useState(false);
  const [sections, setSections] = useState<Record<SectionKey, boolean>>({
    visual: true,
    content: true,
    navigation: false,
  });
  const panelRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [endSpace, setEndSpace] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const toggleRef = useRef<HTMLButtonElement>(null);

  const activeCount = countActiveAccessibilityPreferences(preferences);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  useEffect(() => {
    const onOpen = () => {
      if (!preferences.widgetHidden) setOpen(true);
    };
    window.addEventListener(A11Y_PANEL_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(A11Y_PANEL_OPEN_EVENT, onOpen);
  }, [preferences.widgetHidden]);

  useEffect(() => {
    if (!mounted) return;
    const check = () => setEndSpace(!!document.querySelector('[data-a11y-shell]'));
    check();
    const mo = new MutationObserver(check);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [mounted]);

  const toggleSection = (key: SectionKey) => {
    setSections((current) => ({ ...current, [key]: !current[key] }));
  };


  // Place the FAB so it does not cover text or controls. Prefer lift / shrink
  // (min 44px). Hide the floating button only when the cookie banner genuinely
  // covers its corner, and only then ask the banner to show a «נגישות» alternative
  // that opens this same panel.
  useLayoutEffect(() => {
    if (preferences.widgetHidden || !mounted) return;
    const root = document.documentElement;
    const GAP = 16;
    const END = 12;
    const DEFAULT_SIZE = 52;
    const MIN_SIZE = 44;
    const CLEAR = 8;
    const FAB_BOTTOM =
      'calc(var(--a11y-fab-gap, 16px) + var(--a11y-fab-lift, 0px) + var(--a11y-fab-offset-bottom, 0px) + env(safe-area-inset-bottom, 0px))';

    const maxChromeOffset = (vh: number): number =>
      Math.min(220, Math.max(120, Math.floor(vh * 0.28)));

    const topChromeBottom = (vh: number): number => {
      let bottom = 0;
      for (const el of document.querySelectorAll<HTMLElement>('header')) {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
        if (cs.position !== 'fixed' && cs.position !== 'sticky') continue;
        const r = el.getBoundingClientRect();
        if (r.height < 1 || r.top > 8 || r.bottom > vh * 0.5) continue;
        bottom = Math.max(bottom, Math.ceil(r.bottom));
      }
      return bottom;
    };

    const bottomClearance = (): number => {
      let clear = 0;
      const vh = window.innerHeight;
      const cap = maxChromeOffset(vh);
      for (const el of document.querySelectorAll<HTMLElement>('[data-a11y-clear="bottom"]')) {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
        const r = el.getBoundingClientRect();
        if (r.height < 1) continue;
        if (r.bottom < vh - 32 || r.top >= vh) continue;
        // Tall cookie cards start mid-page; lifting the FAB over them covers
        // content. Only short bottom chrome (BottomNav, compact bar) is a lift.
        if (r.top < vh - cap - 8) continue;
        clear = Math.max(clear, Math.ceil(vh - r.top));
      }
      return clear;
    };

    const hideFabButton = (fab: HTMLElement, wrap: HTMLElement, on: boolean) => {
      if (on) {
        wrap.setAttribute('data-a11y-fab-suppressed', 'true');
        fab.setAttribute('aria-hidden', 'true');
        fab.setAttribute('tabindex', '-1');
        fab.style.visibility = 'hidden';
        fab.style.pointerEvents = 'none';
      } else if (wrap.hasAttribute('data-a11y-fab-suppressed')) {
        wrap.removeAttribute('data-a11y-fab-suppressed');
        fab.removeAttribute('aria-hidden');
        fab.removeAttribute('tabindex');
        fab.style.visibility = '';
        fab.style.pointerEvents = '';
      }
      if (!wrap.style.bottom) wrap.style.bottom = FAB_BOTTOM;
    };

    type Box = { left: number; top: number; right: number; bottom: number };
    const place = (size: number, offset: number, lift: number, rtl: boolean, vw: number, vh: number): Box => {
      const bottom = vh - (GAP + offset + lift);
      return {
        left: rtl ? END : vw - END - size,
        right: rtl ? END + size : vw - END,
        top: bottom - size,
        bottom,
      };
    };

    const hitsFor = (box: Box, wrapEl: HTMLElement): Box[] => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const hits: Box[] = [];
      if (box.right - box.left < 1 || box.bottom - box.top < 1) return hits;
      const inter = (r: DOMRect) => {
        const pad = 4;
        const x1 = Math.max(r.left, box.left - pad);
        const y1 = Math.max(r.top, box.top - pad);
        const x2 = Math.min(r.right, box.right + pad);
        const y2 = Math.min(r.bottom, box.bottom + pad);
        return x2 - x1 > 0 && y2 - y1 > 0 ? { left: x1, top: y1, right: x2, bottom: y2 } : null;
      };
      const prev = wrapEl.style.visibility;
      wrapEl.style.visibility = 'hidden';
      try {
        const sel = 'a,button,input,select,textarea,label,summary,[role=button],[role=tab],[role=link],[role=radio],[role=checkbox],[tabindex]:not([tabindex="-1"])';
        for (const el of document.querySelectorAll<HTMLElement>(sel)) {
          if (wrapEl.contains(el)) continue;
          const r = el.getBoundingClientRect();
          if (r.width < 4 || r.height < 4) continue;
          if (r.width * r.height > 0.6 * vw * vh) continue;
          const i = inter(r);
          if (!i) continue;
          const top = document.elementFromPoint((i.left + i.right) / 2, (i.top + i.bottom) / 2);
          if (top && (el === top || el.contains(top) || top.contains(el))) hits.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
        }
        const pushTextHits = (el: Element) => {
          for (const n of el.childNodes) {
            if (n.nodeType !== Node.TEXT_NODE || !n.textContent?.trim()) continue;
            const rg = document.createRange();
            rg.selectNodeContents(n);
            for (const rr of rg.getClientRects()) {
              if (inter(rr)) hits.push({ left: rr.left, top: rr.top, right: rr.right, bottom: rr.bottom });
            }
          }
        };
        const seen = new Set<Element>();
        for (let gx = 0; gx < 5; gx++) {
          for (let gy = 0; gy < 5; gy++) {
            const x = box.left + 2 + ((box.right - box.left) - 4) * gx / 4;
            const y = box.top + 2 + ((box.bottom - box.top) - 4) * gy / 4;
            if (x < 0 || y < 0 || x >= vw || y >= vh) continue;
            const el = document.elementFromPoint(x, y);
            if (!el || seen.has(el)) continue;
            seen.add(el);
            pushTextHits(el);
          }
        }
        for (const el of document.querySelectorAll('p,h1,h2,h3,h4,span,li,label,small,strong,em,button,a,div')) {
          if (wrapEl.contains(el) || seen.has(el)) continue;
          const r = el.getBoundingClientRect();
          if (r.width < 2 || r.height < 2) continue;
          if (r.width * r.height > 0.45 * vw * vh) continue;
          if (r.right < box.left - 4 || r.left > box.right + 4 || r.bottom < box.top - 4 || r.top > box.bottom + 4) continue;
          seen.add(el);
          pushTextHits(el);
        }
      } finally {
        wrapEl.style.visibility = prev;
      }
      return hits;
    };

    const applySize = (fab: HTMLElement, size: number) => {
      if (size === DEFAULT_SIZE) {
        fab.style.width = '';
        fab.style.height = '';
        fab.style.minWidth = '';
        fab.style.minHeight = '';
      } else {
        fab.style.width = `${size}px`;
        fab.style.height = `${size}px`;
        fab.style.minWidth = `${size}px`;
        fab.style.minHeight = `${size}px`;
      }
    };

    let lastNeedAlt: boolean | null = null;
    const sync = () => {
      const wrap = rootRef.current;
      const fab = wrap?.querySelector<HTMLElement>('.a11y-widget-fab');
      if (!wrap || !fab) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const lift = Number.parseFloat(getComputedStyle(root).getPropertyValue('--a11y-fab-lift')) || 0;
      const rtl = getComputedStyle(root).direction === 'rtl';
      const banner = document.querySelector<HTMLElement>('.cn-banner');
      let bannerVisible = false;
      let bannerTop = vh;
      let bannerBox: DOMRect | null = null;
      if (banner) {
        const cs = getComputedStyle(banner);
        const r = banner.getBoundingClientRect();
        bannerVisible =
          cs.display !== 'none' &&
          cs.visibility !== 'hidden' &&
          Number(cs.opacity) !== 0 &&
          r.height > 1;
        if (bannerVisible) {
          bannerTop = r.top;
          bannerBox = r;
        }
      }

      let size = DEFAULT_SIZE;
      let offset = bottomClearance();
      let box = place(size, offset, lift, rtl, vw, vh);
      let hits = hitsFor(box, wrap);

      if (hits.length) {
        size = MIN_SIZE;
        applySize(fab, size);
        box = place(size, offset, lift, rtl, vw, vh);
        hits = hitsFor(box, wrap);
      } else {
        applySize(fab, size);
      }

      // Walk the FAB up over stacked collisions (e.g. a full-width login pill,
      // then the button above it). With a banner, stay in the bottom chrome
      // band and fall through to the in-banner alternative. With no banner,
      // keep the FAB on screen and prefer a clear slot over a remaining hit.
      const viewportCap = Math.max(0, vh - GAP - lift - size - CLEAR);
      const headerCap = Math.max(0, vh - GAP - lift - size - topChromeBottom(vh) - CLEAR);
      const liftCap = bannerVisible
        ? Math.min(viewportCap, maxChromeOffset(vh), headerCap)
        : Math.min(viewportCap, headerCap);
      let guard = 0;
      while (hits.length && guard < 8) {
        const topMost = Math.min(...hits.map((h) => h.top));
        const needed = Math.ceil(vh - GAP - lift - (topMost - CLEAR));
        const candidate = Math.max(offset, Math.min(needed, liftCap));
        if (candidate <= offset) break;
        const trial = place(size, candidate, lift, rtl, vw, vh);
        if (trial.top < -1) break;
        offset = candidate;
        box = trial;
        hits = hitsFor(trial, wrap);
        guard += 1;
      }

      // No banner and still a hit: no clear slot was found by the walk. Keep the
      // FAB visible and pick the offset that covers the least text or control
      // area (ties go to the lowest offset), instead of hiding the entry point.
      if (hits.length && !bannerVisible) {
        const area = (b: Box, hs: Box[]) =>
          hs.reduce((sum, h) => {
            const w = Math.min(b.right, h.right) - Math.max(b.left, h.left);
            const hh = Math.min(b.bottom, h.bottom) - Math.max(b.top, h.top);
            return sum + (w > 0 && hh > 0 ? w * hh : 0);
          }, 0);
        let bestOffset = offset;
        let bestArea = area(box, hits);
        let bestBox = box;
        let bestHits = hits;
        for (let off = 0; off <= liftCap && bestArea > 0; off += 6) {
          const trial = place(size, off, lift, rtl, vw, vh);
          if (trial.top < -1) break;
          const trialHits = hitsFor(trial, wrap);
          const a = area(trial, trialHits);
          if (a < bestArea) {
            bestArea = a;
            bestOffset = off;
            bestBox = trial;
            bestHits = trialHits;
          }
        }
        offset = bestOffset;
        box = bestBox;
        hits = bestHits;
      }

      const outside = box.top < -1 || box.left < -1 || box.right > vw + 1 || box.bottom > vh + 1;
      const overlaps = (a: Box, b: { left: number; top: number; right: number; bottom: number }) =>
        a.bottom > b.top + 1 && a.top < b.bottom - 1 && a.right > b.left + 1 && a.left < b.right - 1;
      const boxHitsBanner = bannerVisible && bannerBox != null && overlaps(box, bannerBox);
      const noRoomAboveBanner = bannerVisible && bannerTop < MIN_SIZE + GAP + CLEAR;
      // Hide the floating button only when the placed FAB still sits on the
      // banner (or there is no 44px gap above it). A successful shrink/lift
      // that clears the banner keeps the FAB visible. Empty banner padding is
      // still a real cover — do not require a control hit.
      const needAlt = bannerVisible && (noRoomAboveBanner || boxHitsBanner);

      if (needAlt) {
        hideFabButton(fab, wrap, true);
        offset = 0;
      } else {
        // No banner, or room to sit without a real collision: always visible.
        hideFabButton(fab, wrap, false);
        if (outside) {
          const maxOffset = Math.max(0, vh - GAP - lift - size - CLEAR);
          offset = Math.min(offset, maxOffset);
        }
      }
      if (lastNeedAlt !== needAlt) {
        lastNeedAlt = needAlt;
        setAccessibilityBannerAlt(needAlt);
      }
      root.style.setProperty('--a11y-fab-offset-bottom', `${offset}px`);
      root.style.setProperty('--a11y-fab-reserve-block', `${Math.max(0, size + GAP * 2)}px`);
      root.style.setProperty('--a11y-fab-size', `${size}px`);
      if (!wrap.style.bottom) wrap.style.bottom = FAB_BOTTOM;
    };

    sync();
    let raf = 0;
    const retry = () => {
      raf = requestAnimationFrame(() => {
        sync();
        raf = requestAnimationFrame(sync);
      });
    };
    retry();
    const later = window.setTimeout(sync, 400);
    const later2 = window.setTimeout(sync, 900);
    const later3 = window.setTimeout(sync, 1800);
    void document.fonts?.ready.then(() => { if (!preferences.widgetHidden) sync(); });
    const ro = new ResizeObserver(sync);
    if (rootRef.current) ro.observe(rootRef.current);
    const shell = document.querySelector('[data-a11y-shell], main');
    if (shell) ro.observe(shell);
    const observeClear = () => {
      for (const el of document.querySelectorAll('[data-a11y-clear="bottom"], .cn-banner')) {
        ro.observe(el);
      }
    };
    observeClear();
    window.addEventListener('resize', sync);
    window.visualViewport?.addEventListener('resize', sync);
    const mo = new MutationObserver(() => {
      observeClear();
      sync();
    });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(later);
      window.clearTimeout(later2);
      window.clearTimeout(later3);
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener('resize', sync);
      window.visualViewport?.removeEventListener('resize', sync);
      setAccessibilityBannerAlt(false);
      root.style.removeProperty('--a11y-fab-offset-bottom');
      root.style.removeProperty('--a11y-fab-reserve-block');
      root.style.removeProperty('--a11y-fab-size');
    };
  }, [preferences.widgetHidden, open, mounted]);

  if (preferences.widgetHidden) return null;

  const widget = (
    <div
      ref={rootRef}
      className="a11y-widget-root fixed z-80"
      style={{ bottom: 'calc(var(--a11y-fab-gap, 16px) + var(--a11y-fab-lift, 0px) + var(--a11y-fab-offset-bottom, 0px) + env(safe-area-inset-bottom, 0px))', insetInlineEnd: '12px' }}
    >
      {open ? (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-modal="false"
          aria-labelledby={`${panelId}-title`}
          className="a11y-widget-panel mb-3 w-[min(94vw,24rem)] overflow-hidden rounded-[1.35rem] border border-on-dark/75 shadow-[0_24px_60px_rgba(6,78,59,0.22)] backdrop-blur-2xl"
        >
          <div className="a11y-widget-header relative px-4 py-4 text-on-dark">
            <div className="relative flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-on-dark/25 bg-background-card/15 shadow-xs">
                  <Accessibility className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <h2 id={`${panelId}-title`} className="text-base font-black">
                    נגישות
                  </h2>
                  <p className="mt-0.5 text-[11px] leading-snug text-primary-50/90">
                    התאמות אישיות — נשמרות בדפדפן
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  toggleRef.current?.focus();
                }}
                className="rounded-xl border border-on-dark/25 bg-background-card/10 p-2 transition hover:bg-background-card/20"
                aria-label="סגור תפריט נגישות"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </div>

          <div className="max-h-[min(62vh,28rem)] space-y-2 overflow-y-auto px-3 py-3">
            <AccordionSection
              id={`${panelId}-visual`}
              title="התאמות ויזואליות"
              open={sections.visual}
              onToggle={() => toggleSection('visual')}
            >
              <div className="grid grid-cols-3 gap-2">
                <FeatureTile
                  label="ניגודיות גבוהה"
                  pressed={preferences.highContrast}
                  onToggle={() => toggle('highContrast')}
                  icon={<Eye className="h-4 w-4" />}
                />
                <FeatureTile
                  label="מונוכרום"
                  pressed={preferences.monochrome}
                  onToggle={() => {
                    if (preferences.monochrome) {
                      toggle('monochrome');
                    } else {
                      updatePreferences({ monochrome: true, saturation: 'normal' });
                    }
                  }}
                  icon={<Palette className="h-4 w-4" />}
                />
                <FeatureTile
                  label="רוויה נמוכה"
                  pressed={preferences.saturation === 'low'}
                  onToggle={() => {
                    if (preferences.saturation !== 'low') {
                      updatePreferences({ monochrome: false, saturation: 'low' });
                    } else {
                      setSaturation('normal');
                    }
                  }}
                  icon={<Eye className="h-4 w-4" />}
                />
                <FeatureTile
                  label="רוויה גבוהה"
                  pressed={preferences.saturation === 'high'}
                  onToggle={() => {
                    if (preferences.saturation !== 'high') {
                      updatePreferences({ monochrome: false, saturation: 'high' });
                    } else {
                      setSaturation('normal');
                    }
                  }}
                  icon={<ZoomIn className="h-4 w-4" />}
                />
                <FeatureTile
                  label="הדגשת קישורים"
                  pressed={preferences.underlineLinks}
                  onToggle={() => toggle('underlineLinks')}
                  icon={<Underline className="h-4 w-4" />}
                />
                <FeatureTile
                  label="הדגשת כותרות"
                  pressed={preferences.highlightHeadings}
                  onToggle={() => toggle('highlightHeadings')}
                  icon={<Heading className="h-4 w-4" />}
                />
              </div>
            </AccordionSection>

            <AccordionSection
              id={`${panelId}-content`}
              title="התאמות תוכן"
              open={sections.content}
              onToggle={() => toggleSection('content')}
            >
              <ScalePicker<FontScale>
                label="גודל טקסט"
                value={preferences.fontScale}
                onChange={setFontScale}
                options={[
                  { key: 'normal', label: 'רגיל' },
                  { key: 'lg', label: 'גדול' },
                  { key: 'xl', label: 'גדול מאוד' },
                ]}
              />
              <ScalePicker<LineSpacing>
                label="ריווח שורות"
                value={preferences.lineSpacing}
                onChange={setLineSpacing}
                options={[
                  { key: 'normal', label: 'רגיל' },
                  { key: 'lg', label: 'מרווח' },
                  { key: 'xl', label: 'רחב' },
                ]}
              />
              <div className="grid grid-cols-2 gap-2 pt-1">
                <FeatureTile
                  label="ריווח אותיות"
                  pressed={preferences.letterSpacing}
                  onToggle={() => toggle('letterSpacing')}
                  icon={<Type className="h-4 w-4" />}
                />
                <FeatureTile
                  label="גופן קריא"
                  pressed={preferences.readableFont}
                  onToggle={() => toggle('readableFont')}
                  icon={<Type className="h-4 w-4" />}
                />
              </div>
            </AccordionSection>

            <AccordionSection
              id={`${panelId}-navigation`}
              title="התאמות ניווט"
              open={sections.navigation}
              onToggle={() => toggleSection('navigation')}
            >
              <div className="grid grid-cols-3 gap-2">
                <FeatureTile
                  label="הדגשת פוקוס"
                  pressed={preferences.enhancedFocus}
                  onToggle={() => toggle('enhancedFocus')}
                  icon={<Focus className="h-4 w-4" />}
                />
                <FeatureTile
                  label="הדגש אלמנטים"
                  pressed={preferences.highlightElements}
                  onToggle={() => toggle('highlightElements')}
                  icon={<MousePointer2 className="h-4 w-4" />}
                />
                <FeatureTile
                  label="מבנה העמוד"
                  pressed={preferences.showLandmarks}
                  onToggle={() => toggle('showLandmarks')}
                  icon={<Map className="h-4 w-4" />}
                />
                <FeatureTile
                  label="סמן גדול"
                  pressed={preferences.largeCursor}
                  onToggle={() => toggle('largeCursor')}
                  icon={<MousePointer2 className="h-4 w-4" />}
                />
                <FeatureTile
                  label="הפחתת תנועה"
                  pressed={preferences.reduceMotion}
                  onToggle={() => toggle('reduceMotion')}
                  icon={<Wind className="h-4 w-4" />}
                />
                <FeatureTile
                  label="השתק מדיה"
                  pressed={preferences.muteMedia}
                  onToggle={() => toggle('muteMedia')}
                  icon={<VolumeX className="h-4 w-4" />}
                />
              </div>
            </AccordionSection>
          </div>

          <div className="space-y-2 border-t border-on-dark/50 bg-background-card/30 px-3 py-3">
            <button
              type="button"
              onClick={resetPreferences}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-linear-to-l from-ink-700 to-ink-900 px-4 py-3 text-sm font-black text-on-dark shadow-md transition hover:brightness-110"
            >
              <RotateCcw className="h-4 w-4" aria-hidden />
              איפוס כל ההתאמות
            </button>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  hideWidget();
                  setOpen(false);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-on-dark/70 bg-background-card/60 px-3 py-2 text-[11px] font-bold text-ink-700 transition hover:bg-background-card"
              >
                <Minus className="h-3.5 w-3.5" aria-hidden />
                הסתר תפריט
              </button>
              <Link
                href="/accessibility"
                className="ms-auto inline-flex items-center gap-1.5 rounded-xl border border-primary-200/80 bg-primary-50 px-3 py-2 text-[11px] font-bold text-primary-900 transition hover:bg-primary-100"
              >
                <FileText className="h-3.5 w-3.5" aria-hidden />
                הצהרת נגישות
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      <button
        ref={toggleRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
        className={cn(
          'a11y-widget-fab relative inline-flex h-[52px] w-[52px] min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-on-dark/75 text-on-dark shadow-[0_14px_34px_rgba(6,78,59,0.35)] transition-all duration-200 hover:scale-[1.04] focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300',
          open
            ? 'bg-linear-to-br from-ink-700 to-ink-900'
            : 'bg-linear-to-br from-primary-700 via-secondary-600 to-primary-500',
        )}
        aria-label={open ? 'סגור תפריט נגישות' : 'פתח תפריט נגישות'}
      >
        {!open ? (
          <span className="pointer-events-none absolute -inset-1 rounded-full bg-primary-400/30 blur-md" aria-hidden />
        ) : null}
        <Accessibility className="relative h-5 w-5" aria-hidden />
        {!open && activeCount > 0 ? (
          <span className="absolute -top-1 -inset-e-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-on-dark bg-accent-400 px-1 text-[10px] font-black text-accent-950">
            {activeCount}
          </span>
        ) : null}
      </button>
    </div>
  );
  if (!mounted) return null;
  const tree = (
    <>
      {widget}
      {endSpace ? (
        <div
          className="a11y-fab-end-space"
          aria-hidden
          style={{
            height: 'calc(var(--a11y-fab-reserve-block, 84px) + env(safe-area-inset-bottom, 0px))',
            width: 1,
            pointerEvents: 'none',
            overflow: 'hidden',
          }}
        />
      ) : null}
    </>
  );
  return createPortal(tree, document.body);
}