import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Tone = 'emerald' | 'violet' | 'sky' | 'amber' | 'rose' | 'slate';

const ICON_TONES: Record<Tone, string> = {
  emerald: 'from-emerald-500 to-teal-600 text-white shadow-emerald-600/25',
  violet: 'from-violet-500 to-fuchsia-600 text-white shadow-violet-600/25',
  sky: 'from-sky-500 to-cyan-600 text-white shadow-sky-600/25',
  amber: 'from-amber-500 to-orange-600 text-white shadow-amber-600/25',
  rose: 'from-rose-500 to-pink-600 text-white shadow-rose-600/25',
  slate: 'from-slate-700 to-slate-900 text-white shadow-slate-900/20',
};

export const opsGlassCardClass =
  'relative overflow-hidden rounded-3xl border border-white/50 bg-white/45 p-4 shadow-[0_12px_40px_rgba(15,23,42,0.1)] backdrop-blur-2xl sm:p-6';

export const opsInputClass =
  'w-full rounded-xl border border-white/55 bg-white/35 px-3 py-2.5 text-sm font-medium text-slate-900 outline-none backdrop-blur-md transition placeholder:text-slate-400 focus:border-emerald-300/60 focus:ring-2 focus:ring-emerald-400/30';

/** כפתור זכוכית שקוף — לפעולות משניות */
export const opsGlassBtnClass =
  'inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/55 bg-white/30 px-3.5 py-2 text-xs font-bold text-slate-800 shadow-sm backdrop-blur-md transition hover:border-emerald-300/50 hover:bg-white/50 active:scale-[0.99] disabled:opacity-50';

/** כפתור זכוכית מודגש — לפעולה ראשית */
export const opsGlassBtnPrimaryClass =
  'inline-flex items-center justify-center gap-1.5 rounded-xl border border-emerald-300/55 bg-emerald-500/15 px-4 py-2 text-xs font-bold text-emerald-900 shadow-sm backdrop-blur-md transition hover:border-emerald-400/60 hover:bg-emerald-500/25 active:scale-[0.99] disabled:opacity-50';

/** כפתור זכוכית מסוכן */
export const opsGlassBtnDangerClass =
  'inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-300/50 bg-rose-500/10 px-3.5 py-2 text-xs font-bold text-rose-800 shadow-sm backdrop-blur-md transition hover:border-rose-400/55 hover:bg-rose-500/20 active:scale-[0.99] disabled:opacity-50';

export function OpsPanelHeader({
  icon: Icon,
  title,
  description,
  tone = 'emerald',
  actions,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  tone?: Tone;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between', className)}>
      <div className="flex min-w-0 items-start gap-3">
        <span
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br shadow-md',
            ICON_TONES[tone],
          )}
        >
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-lg font-black leading-tight text-slate-900">{title}</h2>
          {description ? <p className="mt-1 text-sm leading-relaxed text-slate-600">{description}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
