'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import {
  Accessibility,
  ChevronDown,
  Eye,
  FileText,
  Focus,
  Heading,
  Link2,
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
          ? 'border-emerald-500/70 bg-gradient-to-b from-emerald-700 to-teal-700 text-white shadow-md'
          : 'border-white/70 bg-white/75 text-slate-700 hover:border-emerald-200 hover:bg-white',
      )}
    >
      <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg', pressed ? 'bg-white/15' : 'bg-emerald-50 text-emerald-700')} aria-hidden>
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
    <div className="overflow-hidden rounded-2xl border border-white/60 bg-white/35">
      <button
        type="button"
        id={`${id}-btn`}
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-start"
      >
        <span className="text-xs font-black text-slate-900">{title}</span>
        <ChevronDown className={cn('h-4 w-4 text-slate-500 transition-transform', open && '-rotate-180')} aria-hidden />
      </button>
      {open ? (
        <div id={`${id}-panel`} role="region" aria-labelledby={`${id}-btn`} className="space-y-2 border-t border-white/50 px-3 pb-3 pt-2">
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
      <p className="mb-2 text-[11px] font-bold text-slate-700">{label}</p>
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
                ? 'border-emerald-600 bg-emerald-700 text-white'
                : 'border-white/70 bg-white/70 text-slate-700 hover:bg-white',
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
  const { preferences, setFontScale, setLineSpacing, setSaturation, toggle, hideWidget, resetPreferences } =
    useAccessibility();

  const [open, setOpen] = useState(false);
  const [sections, setSections] = useState<Record<SectionKey, boolean>>({
    visual: true,
    content: true,
    navigation: false,
  });
  const panelRef = useRef<HTMLDivElement>(null);
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

  if (preferences.widgetHidden) return null;

  return (
    <div className="a11y-widget-root fixed bottom-[calc(5.75rem+env(safe-area-inset-bottom))] start-3 z-[70] sm:bottom-6 sm:start-4">
      {open ? (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-modal="false"
          aria-labelledby={`${panelId}-title`}
          className="a11y-widget-panel mb-3 w-[min(94vw,24rem)] overflow-hidden rounded-[1.35rem] border border-white/75 shadow-[0_24px_60px_rgba(6,78,59,0.22)] backdrop-blur-2xl"
        >
          <div className="a11y-widget-header relative px-4 py-4 text-white">
            <div className="relative flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/25 bg-white/15 shadow-sm">
                  <Accessibility className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <h2 id={`${panelId}-title`} className="text-base font-black">
                    נגישות
                  </h2>
                  <p className="mt-0.5 text-[11px] leading-snug text-emerald-50/90">
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
                className="rounded-xl border border-white/25 bg-white/10 p-2 transition hover:bg-white/20"
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
                  onToggle={() => toggle('monochrome')}
                  icon={<Palette className="h-4 w-4" />}
                />
                <FeatureTile
                  label="רוויה נמוכה"
                  pressed={preferences.saturation === 'low'}
                  onToggle={() =>
                    setSaturation(preferences.saturation === 'low' ? 'normal' : 'low')
                  }
                  icon={<Eye className="h-4 w-4" />}
                />
                <FeatureTile
                  label="רוויה גבוהה"
                  pressed={preferences.saturation === 'high'}
                  onToggle={() =>
                    setSaturation(preferences.saturation === 'high' ? 'normal' : 'high')
                  }
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

          <div className="space-y-2 border-t border-white/50 bg-white/30 px-3 py-3">
            <button
              type="button"
              onClick={resetPreferences}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-slate-700 to-slate-900 px-4 py-3 text-sm font-black text-white shadow-md transition hover:brightness-110"
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
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/70 bg-white/60 px-3 py-2 text-[11px] font-bold text-slate-700 transition hover:bg-white"
              >
                <Minus className="h-3.5 w-3.5" aria-hidden />
                הסתר תפריט
              </button>
              <Link
                href="/accessibility"
                className="ms-auto inline-flex items-center gap-1.5 rounded-xl border border-emerald-200/80 bg-emerald-50 px-3 py-2 text-[11px] font-bold text-emerald-900 transition hover:bg-emerald-100"
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
          'a11y-widget-fab relative inline-flex h-[3.25rem] w-[3.25rem] items-center justify-center rounded-full border border-white/75 text-white shadow-[0_14px_34px_rgba(6,78,59,0.35)] transition-all duration-200 hover:scale-[1.04] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300',
          open
            ? 'bg-gradient-to-br from-slate-700 to-slate-900'
            : 'bg-gradient-to-br from-emerald-700 via-teal-600 to-emerald-500',
        )}
        aria-label={open ? 'סגור תפריט נגישות' : 'פתח תפריט נגישות'}
      >
        {!open ? (
          <span className="pointer-events-none absolute -inset-1 rounded-full bg-emerald-400/30 blur-md" aria-hidden />
        ) : null}
        <Accessibility className="relative h-5 w-5" aria-hidden />
        {!open && activeCount > 0 ? (
          <span className="absolute -top-1 -end-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-amber-400 px-1 text-[10px] font-black text-amber-950">
            {activeCount}
          </span>
        ) : null}
      </button>
    </div>
  );
}
