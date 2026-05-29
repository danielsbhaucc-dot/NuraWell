'use client';

/**
 * SummariesPageClient — ה-shell של דף /summaries.
 *
 * מקבל מ-server:
 *   • userId
 *   • summaries (כל הרשומות מ-`periodic_summaries`, מסודרות לפי created_at desc)
 *   • currentPeriods (מפתחות התקופה הנוכחית פר type, לכפתורי "צור עכשיו")
 *
 * אחראי על:
 *   • Tabs לסינון (הכל / יומי / שבועי / חודשי / רבעוני / חצי / שנתי).
 *   • Toast על הצלחה / שגיאה של ה-API.
 *   • לאחר success — `router.refresh()` כדי שה-server component יביא רשימה חדשה.
 *   • Empty state עם הצעה ללחוץ על אחד מהכפתורים.
 */

import { useMemo, useState } from 'react';
import { Sparkles, Filter } from 'lucide-react';
import type { SummaryType } from '../../lib/notifications/summaries/period-keys';
import type { PeriodicSummaryRow } from '../../app/(dashboard)/summaries/page';
import { SummaryCard, TYPE_COLORS } from './SummaryCard';
import { GenerateSummaryButton } from './GenerateSummaryButton';
import { ToastContainer, useToast } from '../shared/Toast';

const SUMMARY_TYPES_ORDERED: SummaryType[] = [
  'daily',
  'weekly',
  'monthly',
  'quarterly',
  'semi_annual',
  'annual',
];

const TYPE_LABEL_HE: Record<SummaryType, string> = {
  daily: 'יומי',
  weekly: 'שבועי',
  monthly: 'חודשי',
  quarterly: 'רבעוני',
  semi_annual: 'חצי-שנתי',
  annual: 'שנתי',
};

interface SummariesPageClientProps {
  userId: string;
  summaries: PeriodicSummaryRow[];
  currentPeriods: Record<SummaryType, string>;
}

type FilterValue = 'all' | SummaryType;

export function SummariesPageClient({
  userId,
  summaries,
  currentPeriods,
}: SummariesPageClientProps) {
  const [filter, setFilter] = useState<FilterValue>('all');
  const toast = useToast();

  const filteredSummaries = useMemo(() => {
    if (filter === 'all') return summaries;
    return summaries.filter((s) => s.type === filter);
  }, [filter, summaries]);

  const handleSuccess = (type: SummaryType) => () => {
    toast.success(`הסיכום ה${TYPE_LABEL_HE[type]} מוכן`, 'המבט החדש מופיע למטה ברשימה.');
  };

  const handleError = (type: SummaryType) => (msg: string) => {
    toast.error(`לא הצלחנו ליצור סיכום ${TYPE_LABEL_HE[type]}`, msg);
  };

  return (
    <div dir="rtl" className="container-mobile px-4 pb-12">
      <ToastContainer toasts={toast.toasts} onDismiss={toast.dismiss} />

      {/* Hero */}
      <header className="pt-2 pb-5">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="inline-flex items-center justify-center w-9 h-9 rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-sm">
            <Sparkles className="w-5 h-5" strokeWidth={2.4} />
          </span>
          <h1 className="text-2xl font-black tracking-tight text-gray-900">הסיכומים שלי</h1>
        </div>
        <p className="text-sm text-gray-600 leading-relaxed">
          המבט של אלמוג על המסע שלך — יומי, שבועי, חודשי וכל הדרך עד הסיכום השנתי.
          סיכומים גבוהים יותר מבוססים על הסיכומים שמתחתיהם, בלי לחזור על מספרים.
        </p>
      </header>

      {/* Generate now grid */}
      <section
        aria-label="צור סיכום עכשיו"
        className="glass-card-strong p-4 mb-5"
      >
        <h2 className="text-sm font-extrabold text-gray-900 mb-3 flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-emerald-600" />
          צור סיכום עכשיו
        </h2>
        <div className="grid grid-cols-2 gap-2.5">
          {SUMMARY_TYPES_ORDERED.map((type) => (
            <GenerateSummaryButton
              key={type}
              userId={userId}
              type={type}
              periodKey={currentPeriods[type]}
              onSuccess={handleSuccess(type)}
              onError={handleError(type)}
            />
          ))}
        </div>
        <p className="text-[11px] text-gray-500 mt-3 leading-snug">
          טיפ: לחיצה על "סיכום שנתי" כשאין סיכומים מתחתיו תייצר אוטומטית את כל
          הרמות הנמוכות החסרות ולכן עשויה לקחת מעט יותר זמן.
        </p>
      </section>

      {/* Filter tabs */}
      <nav
        aria-label="סינון סיכומים"
        className="flex items-center gap-2 overflow-x-auto pb-2 mb-2 -mx-4 px-4 [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: 'none' }}
      >
        <FilterChip
          active={filter === 'all'}
          onClick={() => setFilter('all')}
          icon={<Filter className="w-3.5 h-3.5" />}
        >
          הכל
          <span className="opacity-60 mr-1">({summaries.length})</span>
        </FilterChip>
        {SUMMARY_TYPES_ORDERED.map((type) => {
          const count = summaries.filter((s) => s.type === type).length;
          if (count === 0) return null;
          return (
            <FilterChip
              key={type}
              active={filter === type}
              onClick={() => setFilter(type)}
              accentClass={TYPE_COLORS[type].accent}
            >
              {TYPE_LABEL_HE[type]}
              <span className="opacity-60 mr-1">({count})</span>
            </FilterChip>
          );
        })}
      </nav>

      {/* List */}
      {filteredSummaries.length === 0 ? (
        <EmptyState filterApplied={filter !== 'all'} />
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {filteredSummaries.map((s) => (
            <SummaryCard key={s.id} summary={s} />
          ))}
        </div>
      )}
    </div>
  );
}

interface FilterChipProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  icon?: React.ReactNode;
  accentClass?: string;
}

function FilterChip({ active, onClick, children, icon, accentClass }: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all
        ${
          active
            ? 'bg-gray-900 text-white shadow-sm'
            : 'bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50'
        }`}
      aria-pressed={active}
    >
      {accentClass && active && (
        <span className={`w-1.5 h-1.5 rounded-full ${accentClass}`} />
      )}
      {icon}
      {children}
    </button>
  );
}

function EmptyState({ filterApplied }: { filterApplied: boolean }) {
  return (
    <div className="glass-card p-6 text-center">
      <div className="mx-auto w-14 h-14 rounded-2xl bg-emerald-50 ring-1 ring-emerald-200 flex items-center justify-center mb-3">
        <Sparkles className="w-6 h-6 text-emerald-600" />
      </div>
      <h3 className="text-base font-extrabold text-gray-900 mb-1">
        {filterApplied ? 'אין עדיין סיכומים מהסוג הזה' : 'עוד אין סיכומים'}
      </h3>
      <p className="text-sm text-gray-600 leading-relaxed">
        {filterApplied
          ? 'נסה לסנן ב"הכל", או לחץ למעלה על "צור עכשיו" כדי שאני אכין לך אחד.'
          : 'לחץ למעלה על "צור עכשיו" באחת מהרמות, ואני אכין לך מבט אישי על התקופה.'}
      </p>
    </div>
  );
}
