'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { FinderBreadcrumbSegment } from '@/lib/media-manager/smart-folders';

type FinderPathBarProps = {
  crumbs: FinderBreadcrumbSegment[];
  itemCount: number;
  canGoBack: boolean;
  onBack: () => void;
  onNavigate: (crumb: FinderBreadcrumbSegment) => void;
};

export function FinderPathBar({
  crumbs,
  itemCount,
  canGoBack,
  onBack,
  onNavigate,
}: FinderPathBarProps) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-white/20 bg-white/8 px-3 py-2">
      <button
        type="button"
        onClick={onBack}
        disabled={!canGoBack}
        aria-label="חזרה לתיקייה מעלה"
        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition',
          canGoBack
            ? 'border-white/40 bg-white/25 text-slate-700 hover:bg-white/40'
            : 'cursor-default border-white/20 bg-white/10 text-slate-400'
        )}
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </button>

      <div
        className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto rounded-lg border border-white/30 bg-white/20 px-1 py-0.5"
        role="navigation"
        aria-label="נתיב תיקייה"
      >
        {crumbs.map((crumb, idx) => {
          const isLast = idx === crumbs.length - 1;
          return (
            <span key={`${crumb.level}-${crumb.categoryId ?? 'k'}-${crumb.subfolder ?? 'r'}-${idx}`} className="flex shrink-0 items-center">
              {idx > 0 ? (
                <ChevronLeft className="mx-0.5 h-3 w-3 shrink-0 text-slate-400/80" aria-hidden />
              ) : null}
              <button
                type="button"
                disabled={isLast}
                onClick={() => onNavigate(crumb)}
                className={cn(
                  'max-w-[9rem] truncate rounded-md px-2 py-1 text-[11px] font-semibold transition',
                  isLast
                    ? 'cursor-default bg-white/45 text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:bg-white/35 hover:text-slate-800'
                )}
              >
                {crumb.label}
              </button>
            </span>
          );
        })}
      </div>

      <span className="hidden shrink-0 text-[10px] font-medium text-slate-500 sm:inline">
        {itemCount} פריטים
      </span>
    </div>
  );
}
