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

  const toggleSection = (key: SectionKey) => {
    setSections((current) => ({ ...current, [key]: !current[key] }));
  };


  // Publish reserved bottom space and lift the FAB above fixed bottom nav (not the cookie banner).
  useLayoutEffect(() => {
    if (preferences.widgetHidden) return;
    const root = document.documentElement;
    const bottomClearance = (): number => {
      let clear = 0;
      const vh = window.innerHeight;
      for (const el of document.querySelectorAll<HTMLElement>('[data-a11y-clear="bottom"]')) {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
        const r = el.getBoundingClientRect();
        if (r.height < 1) continue;
        if (r.bottom < vh - 8 || r.top >= vh) continue;
        clear = Math.max(clear, Math.ceil(vh - r.top));
      }
      return clear;
    };
    const sync = () => {
      const wrap = rootRef.current;
      const fab = wrap?.querySelector<HTMLElement>('.a11y-widget-fab');
      if (!wrap || !fab) return;
      const gap = 16;
      const vh = window.innerHeight;
      const offset = bottomClearance();
      root.style.setProperty('--a11y-fab-offset-bottom', `${offset}px`);
      const fr = fab.getBoundingClientRect();
      const block = Math.max(0, Math.ceil((fr.height || 52) + gap * 2));
      root.style.setProperty('--a11y-fab-reserve-block', `${block}px`);
      root.style.setProperty('--a11y-fab-size', `${Math.round(fr.height || 52)}px`);
      const size = fr.height || 52;
      const maxBottom = Math.max(8, vh - size - 8);
      const computedBottom = Number.parseFloat(getComputedStyle(wrap).bottom) || 0;
      if (computedBottom > maxBottom) {
        wrap.style.setProperty('bottom', `${maxBottom}px`, 'important');
      } else if (wrap.style.getPropertyPriority('bottom') === 'important') {
        wrap.style.removeProperty('bottom');
      }
    };
    sync();
    const ro = new ResizeObserver(sync);
    if (rootRef.current) ro.observe(rootRef.current);
    for (const el of document.querySelectorAll('[data-a11y-clear="bottom"]')) ro.observe(el);
    window.addEventListener('resize', sync);
    const mo = new MutationObserver(() => {
      for (const el of document.querySelectorAll('[data-a11y-clear="bottom"]')) ro.observe(el);
      sync();
    });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener('resize', sync);
      root.style.removeProperty('--a11y-fab-offset-bottom');
      root.style.removeProperty('--a11y-fab-reserve-block');
      root.style.removeProperty('--a11y-fab-size');
    };
  }, [preferences.widgetHidden, open]);

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
    </>
  );
  return createPortal(tree, document.body);
}