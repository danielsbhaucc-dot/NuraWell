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
  'w-full rounded-xl border border-white/60 bg-white/65 px-3 py-2.5 text-sm font-medium text-slate-900 outline-none backdrop-blur-sm transition placeholder:text-slate-400 focus:border-emerald-300/70 focus:ring-2 focus:ring-emerald-400/35';

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
