'use client';
/** Shared, restrained primitives for Ops logs (activity + errors). Status color = small dot/pill only. */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Bell, Clock, Cpu, LogIn, Mail, MonitorSmartphone, Search, Send, ShieldAlert, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import { cn } from '@/lib/cn';

export type Status = 'success' | 'failed' | 'warning' | 'pending' | 'security' | 'info';

export const STATUS: Record<Status, { label: string; dot: string; text: string }> = {
  success: { label: 'הצליח', dot: 'bg-emerald-500', text: 'text-emerald-700' },
  failed: { label: 'נכשל', dot: 'bg-rose-500', text: 'text-rose-700' },
  warning: { label: 'אזהרה', dot: 'bg-amber-500', text: 'text-amber-700' },
  pending: { label: 'ממתין', dot: 'bg-sky-500', text: 'text-sky-700' },
  security: { label: 'אבטחה', dot: 'bg-violet-500', text: 'text-violet-700' },
  info: { label: 'מידע', dot: 'bg-slate-400', text: 'text-slate-600' },
};

const ICONS: Record<string, typeof LogIn> = { login: LogIn, email: Mail, telegram: Send, push: Bell, security: ShieldAlert, device: MonitorSmartphone, cron: Clock, ai: Sparkles, other: Cpu };
export function CatIcon({ cat, className }: { cat: string; className?: string }) {
  const I = ICONS[cat] ?? Cpu;
  return <I size={16} strokeWidth={1.75} className={className} aria-hidden />;
}

/** Calm surface: cream, hairline border, soft blur. */
export function Glass({ children, className }: { children: ReactNode; className?: string; glow?: Status }) {
  return <div className={cn('rounded-2xl border border-black/[0.06] bg-cream/80 backdrop-blur-xl dark:border-cream/10 dark:bg-slate-900/50', className)}>{children}</div>;
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
        <h2 className="text-[13px] font-semibold text-slate-500 dark:text-slate-400">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Metrics({ items }: { items: { label: string; value: ReactNode; status?: Status; sub?: ReactNode }[] }) {
  return (
    <Glass className="grid grid-cols-2 divide-black/[0.06] sm:grid-cols-4 sm:divide-x sm:divide-x-reverse dark:divide-cream/10">
      {items.slice(0, 4).map((m, i) => (
        <div key={m.label} className={cn('flex flex-col gap-1 px-4 py-4', i < 2 && 'border-b border-black/[0.06] sm:border-b-0 dark:border-cream/10', i % 2 === 0 && 'border-e border-black/[0.06] sm:border-e-0 dark:border-cream/10')}>
          <span className="flex items-center gap-1.5 text-[12px] text-slate-500 dark:text-slate-400">{m.status ? <Dot status={m.status} /> : null}{m.label}</span>
          <span className="font-display text-[1.6rem] font-semibold tabular-nums leading-none text-slate-900 dark:text-cream">{m.value}</span>
          {m.sub ? <span className="text-[11px] text-slate-400">{m.sub}</span> : null}
        </div>
      ))}
    </Glass>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" className="inline-flex rounded-xl bg-black/[0.05] p-0.5 dark:bg-cream/10">
      {options.map(([k, l]) => (
        <button key={k} type="button" role="radio" aria-checked={value === k} onClick={() => onChange(k)}
          className={cn('rounded-[10px] px-3 py-1.5 text-[13px] font-medium transition', value === k ? 'bg-cream text-slate-900 shadow-sm dark:bg-slate-700 dark:text-cream' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400')}>{l}</button>
      ))}
    </div>
  );
}

export function SearchBar({ value, onChange, placeholder, onFilters, activeCount, trailing }: { value: string; onChange: (v: string) => void; placeholder: string; onFilters?: () => void; activeCount?: number; trailing?: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <label className="flex h-10 flex-1 items-center gap-2 rounded-xl border border-black/[0.06] bg-cream px-3 focus-within:border-emerald-700/40 dark:border-cream/10 dark:bg-slate-900/60">
        <Search size={16} className="text-slate-400" aria-hidden />
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full bg-transparent text-[14px] text-slate-800 outline-none placeholder:text-slate-400 dark:text-cream" />
        {value ? <button type="button" onClick={() => onChange('')} aria-label="נקה חיפוש" className="text-slate-400"><X size={14} /></button> : null}
      </label>
      {onFilters ? (
        <button type="button" onClick={onFilters} className="relative flex h-10 items-center gap-1.5 rounded-xl border border-black/[0.06] bg-cream px-3 text-[13px] font-medium text-slate-700 dark:border-cream/10 dark:bg-slate-900/60 dark:text-slate-200">
          <SlidersHorizontal size={15} />סינון
          {activeCount ? <span className="grid h-4 min-w-4 place-items-center rounded-full bg-slate-900 px-1 text-[10px] text-cream dark:bg-cream dark:text-slate-900">{activeCount}</span> : null}
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
      <button type="button" aria-label="סגור" className="absolute inset-0 bg-slate-900/20 backdrop-blur-[2px]" onClick={onClose} />
      <div ref={ref} tabIndex={-1} className="relative w-full max-w-md rounded-t-3xl border border-black/[0.06] bg-cream p-5 shadow-2xl outline-none sm:rounded-2xl dark:border-cream/10 dark:bg-slate-900">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-black/10 sm:hidden" />
        <div className="mb-4 flex items-center justify-between"><h3 className="text-[15px] font-semibold text-slate-900 dark:text-cream">{title}</h3><button type="button" onClick={onClose} aria-label="סגור" className="text-slate-400"><X size={18} /></button></div>
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
            className={cn('inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[13px] transition', value === k ? 'border-slate-900 bg-slate-900 text-cream dark:border-cream dark:bg-cream dark:text-slate-900' : 'border-black/[0.08] text-slate-600 hover:border-black/20 dark:border-cream/15 dark:text-slate-300')}>
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
      <button type="button" onClick={onClear} className="shrink-0 font-medium text-slate-800 underline underline-offset-4 dark:text-cream">נקה</button>
    </div>
  );
}

export function Spark({ data, status = 'info' }: { data: number[]; status?: Status }) {
  const max = Math.max(1, ...data);
  return (
    <div className="flex h-5 items-end gap-[2px]" aria-label="מגמה, 7 ימים" dir="ltr">
      {data.map((v, i) => <span key={i} className={cn('w-1 rounded-[1px]', v ? STATUS[status].dot : 'bg-black/10 dark:bg-cream/15')} style={{ height: `${Math.max(15, (v / max) * 100)}%`, opacity: v ? 0.75 : 1 }} />)}
    </div>
  );
}

export function Empty({ title, sub }: { title: string; sub?: string }) {
  return <div className="px-4 py-14 text-center"><div className="text-[15px] font-medium text-slate-700 dark:text-slate-200">{title}</div>{sub ? <div className="mt-1 text-[13px] text-slate-400">{sub}</div> : null}</div>;
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
