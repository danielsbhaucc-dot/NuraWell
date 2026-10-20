'use client';
/** Shared iOS-style frosted-glass primitives for Ops logs (activity + errors).
 *  Perf: only top-level surfaces (Glass, Sheet) use backdrop-blur; rows inside never do. */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Bell, Clock, Cpu, LogIn, Mail, MonitorSmartphone, Search, Send, ShieldAlert, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import { cn } from '@/lib/cn';

export type Status = 'success' | 'failed' | 'warning' | 'pending' | 'security' | 'info';

export const STATUS: Record<Status, { label: string; dot: string; text: string; stripe: string; glow: string }> = {
  success: { label: 'הצליח', dot: 'bg-emerald-500', text: 'text-emerald-700', stripe: 'bg-emerald-500/70', glow: '' },
  failed: { label: 'נכשל', dot: 'bg-rose-500', text: 'text-rose-700', stripe: 'bg-gradient-to-b from-rose-500 to-rose-600', glow: 'shadow-[0_10px_40px_-16px_rgba(225,29,72,0.45)] ring-1 ring-rose-400/30' },
  warning: { label: 'אזהרה', dot: 'bg-amber-500', text: 'text-amber-700', stripe: 'bg-gradient-to-b from-amber-400 to-amber-500', glow: 'ring-1 ring-amber-400/30' },
  pending: { label: 'ממתין', dot: 'bg-sky-500', text: 'text-sky-700', stripe: 'bg-sky-400/80', glow: '' },
  security: { label: 'אבטחה', dot: 'bg-violet-500', text: 'text-violet-700', stripe: 'bg-gradient-to-b from-violet-500 to-fuchsia-500', glow: 'ring-1 ring-violet-400/30' },
  info: { label: 'מידע', dot: 'bg-slate-400', text: 'text-slate-600', stripe: '', glow: '' },
};

/** Status accent stripe on the inline-start edge. Only rendered for statuses that need attention (or when forced). */
export function Stripe({ status, all }: { status: Status; all?: boolean }) {
  const show = all ? STATUS[status].stripe : (status === 'failed' || status === 'warning' || status === 'security') && STATUS[status].stripe;
  if (!show) return null;
  return <span aria-hidden className={cn('pointer-events-none absolute inset-y-2 start-0 w-[3px] rounded-e-full', STATUS[status].stripe)} />;
}

const ICONS: Record<string, typeof LogIn> = { login: LogIn, email: Mail, telegram: Send, push: Bell, security: ShieldAlert, device: MonitorSmartphone, cron: Clock, ai: Sparkles, other: Cpu };
export function CatIcon({ cat, className }: { cat: string; className?: string }) {
  const I = ICONS[cat] ?? Cpu;
  return <I size={16} strokeWidth={1.75} className={className} aria-hidden />;
}

/** Frosted cream glass: translucent, backdrop blur, inner highlight, soft depth. Optional status glow. */
export const GLASS = 'relative rounded-3xl border border-gc/70 bg-gc/70 shadow-[0_1px_0_0_rgba(241,244,234,0.6)_inset,0_12px_36px_-18px_rgba(30,41,30,0.28)] backdrop-blur-xl backdrop-saturate-150 supports-[not(backdrop-filter:blur(1px))]:bg-gc/95 dark:border-gc/10 dark:bg-slate-900/55';
export function Glass({ children, className, glow }: { children: ReactNode; className?: string; glow?: Status }) {
  return <div className={cn(GLASS, glow && STATUS[glow].glow, className)}>{children}</div>;
}

export function Dot({ status, pulse }: { status: Status; pulse?: boolean }) {
  return <span className={cn('inline-block h-2 w-2 shrink-0 rounded-full', STATUS[status].dot, pulse && 'animate-pulse')} aria-hidden />;
}

export function Pill({ status, children }: { status: Status; children?: ReactNode }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[12px] font-medium', STATUS[status].text, 'dark:text-slate-300')}>
      <Dot status={status} pulse={status === 'pending'} />{children ?? STATUS[status].label}
    </span>
  );
}

export function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between px-1">
        <h2 className="text-[13px] font-semibold text-slate-500 dark:text-slate-500">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Metrics({ items }: { items: { label: string; value: ReactNode; status?: Status; sub?: ReactNode }[] }) {
  return (
    <Glass className="grid grid-cols-2 divide-black/[0.06] sm:grid-cols-4 sm:divide-x sm:divide-x-reverse dark:divide-gc/10">
      {items.slice(0, 4).map((m, i) => (
        <div key={m.label} className={cn('flex flex-col gap-1 px-4 py-4', i < 2 && 'border-b border-black/[0.06] sm:border-b-0 dark:border-gc/10', i % 2 === 0 && 'border-e border-black/[0.06] sm:border-e-0 dark:border-gc/10')}>
          <span className="flex items-center gap-1.5 text-[12px] text-slate-500 dark:text-slate-500">{m.status ? <Dot status={m.status} /> : null}{m.label}</span>
          <span className="font-display text-[1.6rem] font-semibold tabular-nums leading-none text-slate-900 dark:text-gc">{m.value}</span>
          {m.sub ? <span className="text-[11px] text-slate-500">{m.sub}</span> : null}
        </div>
      ))}
    </Glass>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" className="inline-flex rounded-2xl bg-cream-deep/60 p-0.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)_inset] dark:bg-gc/10">
      {options.map(([k, l]) => (
        <button key={k} type="button" role="radio" aria-checked={value === k} onClick={() => onChange(k)}
          className={cn('rounded-[14px] px-3 py-1.5 text-[13px] font-medium transition', value === k ? 'bg-gc text-slate-900 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.15)] dark:bg-slate-700 dark:text-gc' : 'text-slate-500 hover:text-slate-800 dark:text-slate-500')}>{l}</button>
      ))}
    </div>
  );
}

export function SearchBar({ value, onChange, placeholder, onFilters, activeCount, trailing }: { value: string; onChange: (v: string) => void; placeholder: string; onFilters?: () => void; activeCount?: number; trailing?: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <label className="flex h-10 flex-1 items-center gap-2 rounded-2xl border border-gc/70 bg-gc/70 px-3 shadow-[0_1px_0_0_rgba(241,244,234,0.6)_inset] focus-within:border-emerald-700/40 dark:border-gc/10 dark:bg-slate-900/60">
        <Search size={16} className="text-slate-500" aria-hidden />
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full bg-transparent text-[14px] text-slate-800 outline-none placeholder:text-slate-500 dark:text-gc" />
        {value ? <button type="button" onClick={() => onChange('')} aria-label="נקה חיפוש" className="text-slate-500"><X size={14} /></button> : null}
      </label>
      {onFilters ? (
        <button type="button" onClick={onFilters} className="relative flex h-10 items-center gap-1.5 rounded-2xl border border-gc/70 bg-gc/70 px-3 shadow-[0_1px_0_0_rgba(241,244,234,0.6)_inset] text-[13px] font-medium text-slate-700 dark:border-gc/10 dark:bg-slate-900/60 dark:text-slate-200">
          <SlidersHorizontal size={15} />סינון
          {activeCount ? <span className="grid h-4 min-w-4 place-items-center rounded-full bg-slate-900 px-1 text-[10px] text-gc dark:bg-gc dark:text-slate-900">{activeCount}</span> : null}
        </button>
      ) : null}
      {trailing}
    </div>
  );
}

/** Bottom sheet on mobile, anchored popover on desktop. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (open) ref.current?.focus(); const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-start sm:pt-28" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="סגור" className="absolute inset-0 bg-slate-900/25" onClick={onClose} />
      <div ref={ref} tabIndex={-1} className="relative w-full max-w-md rounded-t-[28px] border border-gc/70 bg-gc/75 p-5 shadow-[0_1px_0_0_rgba(241,244,234,0.7)_inset,0_24px_60px_-20px_rgba(30,41,30,0.4)] outline-none backdrop-blur-2xl backdrop-saturate-150 supports-[not(backdrop-filter:blur(1px))]:bg-gc sm:rounded-3xl dark:border-gc/10 dark:bg-slate-900/80">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-black/10 sm:hidden" />
        <div className="mb-4 flex items-center justify-between"><h3 className="text-[15px] font-semibold text-slate-900 dark:text-gc">{title}</h3><button type="button" onClick={onClose} aria-label="סגור" className="text-slate-500"><X size={18} /></button></div>
        <div className="flex flex-col gap-5">{children}</div>
      </div>
    </div>
  );
}

export function OptionGroup<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string, Status?][]; onChange: (v: T) => void }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-[12px] font-medium text-slate-500">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map(([k, l, s]) => (
          <button key={k} type="button" onClick={() => onChange(k)} aria-pressed={value === k}
            className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] transition', value === k ? 'border-slate-900 bg-slate-900 text-gc dark:border-gc dark:bg-gc dark:text-slate-900' : 'border-gc/80 bg-gc/60 text-slate-700 hover:border-black/15 dark:border-gc/15 dark:text-slate-300')}>
            {s ? <Dot status={s} /> : null}{l}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/** One compact line summarizing active filters + clear. */
export function ActiveFilters({ parts, onClear }: { parts: string[]; onClear: () => void }) {
  if (!parts.length) return null;
  return (
    <div className="flex items-center gap-2 px-1 text-[12px] text-slate-500">
      <span className="truncate">מסונן: {parts.join(' · ')}</span>
      <button type="button" onClick={onClear} className="shrink-0 font-medium text-slate-800 underline underline-offset-4 dark:text-gc">נקה</button>
    </div>
  );
}

export function Spark({ data, status = 'info' }: { data: number[]; status?: Status }) {
  const max = Math.max(1, ...data);
  return (
    <div className="flex h-5 items-end gap-[2px]" aria-label="מגמה, 7 ימים" dir="ltr">
      {data.map((v, i) => <span key={i} className={cn('w-1 rounded-[1px]', v ? STATUS[status].dot : 'bg-black/10 dark:bg-gc/15')} style={{ height: `${Math.max(15, (v / max) * 100)}%`, opacity: v ? 0.75 : 1 }} />)}
    </div>
  );
}

export function Empty({ title, sub }: { title: string; sub?: string }) {
  return <div className="px-4 py-14 text-center"><div className="text-[15px] font-medium text-slate-700 dark:text-slate-200">{title}</div>{sub ? <div className="mt-1 text-[13px] text-slate-500">{sub}</div> : null}</div>;
}

export function Skeleton() {
  return <Glass className="divide-y divide-black/[0.05]">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="flex items-center gap-3 px-4 py-4"><div className="h-2 w-2 rounded-full bg-black/10" /><div className="h-3 flex-1 animate-pulse rounded bg-black/[0.06]" /><div className="h-3 w-12 animate-pulse rounded bg-black/[0.06]" /></div>)}</Glass>;
}

export function useDisclosure() { const [open, set] = useState(false); return { open, show: () => set(true), hide: () => set(false) }; }

export const fmtIl = (iso: string) => new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
export function ago(iso: string, now = Date.now()) {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return 'עכשיו';
  if (s < 3600) return `${Math.round(s / 60)} דק׳`;
  if (s < 86400) return `${Math.round(s / 3600)} שע׳`;
  return `${Math.round(s / 86400)} ימים`;
}
