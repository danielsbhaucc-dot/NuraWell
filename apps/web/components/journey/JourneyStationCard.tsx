'use client';

import { MapPin } from 'lucide-react';
import type { JourneyStationGroup } from '../../lib/journey/group-journey-by-station';
import { cn } from '../../lib/cn';
import { StockImageAttribution } from '../media/StockImageAttribution';

type JourneyStationCardProps = {
  group: JourneyStationGroup;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
};

export function JourneyStationCard({ group, index, isSelected, onSelect }: JourneyStationCardProps) {
  const done = group.steps.filter((s) => s.progress?.is_completed).length;
  const total = group.steps.length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const isEmpty = total === 0;
  const hasCover = Boolean(group.coverImageUrl);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'relative snap-start shrink-0 overflow-hidden rounded-2xl px-4 py-3.5 text-right transition-all min-w-[min(88vw,300px)] sm:min-w-[280px]',
        'border shadow-md active:scale-[0.99]',
        isSelected
          ? 'ring-2 ring-emerald-400/90 ring-offset-2 ring-offset-[#EDF5F0]'
          : 'opacity-95 hover:opacity-100',
        isEmpty && !isSelected && 'opacity-80'
      )}
      style={{
        background: hasCover
          ? undefined
          : isSelected
            ? 'linear-gradient(145deg, rgba(255,255,255,0.99) 0%, rgba(236,253,245,0.97) 55%, rgba(209,250,229,0.35) 100%)'
            : 'rgba(255,255,255,0.9)',
        borderColor: isSelected ? 'rgba(16,185,129,0.5)' : 'rgba(226,232,240,0.9)',
        boxShadow: isSelected
          ? '0 12px 32px rgba(16,185,129,0.2), inset 0 1px 0 rgba(255,255,255,0.9)'
          : '0 4px 18px rgba(15,118,110,0.07)',
      }}
    >
      {hasCover ? (
        <>
          <img
            src={group.coverImageUrl!}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            loading="lazy"
          />
          <div
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(180deg, rgba(6,78,59,0.42) 0%, rgba(15,23,42,0.78) 100%)',
            }}
          />
        </>
      ) : null}

      <div className={cn('relative z-10', hasCover && 'text-white')}>
        <div className="mb-2 flex items-start gap-3">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl text-sm font-black text-white"
            style={{
              background: isSelected
                ? 'linear-gradient(135deg, #047857, #10b981)'
                : 'linear-gradient(135deg, #0f766e, #14b8a6)',
              boxShadow: hasCover ? '0 4px 12px rgba(0,0,0,0.25)' : '0 4px 12px rgba(4,120,87,0.25)',
            }}
          >
            {index + 1}
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-0.5 flex items-center gap-1.5">
              <MapPin
                className={cn('h-3.5 w-3.5 shrink-0 opacity-90', hasCover ? 'text-emerald-100' : 'text-emerald-600')}
                aria-hidden
              />
              <p
                className={cn(
                  'line-clamp-2 text-right text-[15px] font-black leading-snug',
                  hasCover ? 'text-white drop-shadow-sm' : ''
                )}
                style={hasCover ? undefined : { color: '#1A1730' }}
              >
                {group.title}
              </p>
            </div>
            {group.description ? (
              <p
                className={cn(
                  'mt-1 line-clamp-2 text-xs leading-relaxed',
                  hasCover ? 'text-white/80' : 'text-gray-500'
                )}
              >
                {group.description}
              </p>
            ) : null}
          </div>
        </div>

        <p className={cn('mb-2.5 text-xs font-medium', hasCover ? 'text-emerald-50/90' : 'text-gray-600')}>
          {isEmpty ? 'אין עדיין צעדים בתחנה' : `${done}/${total} צעדים · ${pct}%`}
        </p>

        <motionlessProgress hasCover={hasCover} isEmpty={isEmpty} pct={pct} />

        {hasCover && group.coverImageCredit ? (
          <StockImageAttribution
            credit={group.coverImageCredit}
            variant="public"
            className="mt-2 text-[10px] leading-snug text-white/65"
          />
        ) : null}
      </div>
    </button>
  );
}

function motionlessProgress({
  hasCover,
  isEmpty,
  pct,
}: {
  hasCover: boolean;
  isEmpty: boolean;
  pct: number;
}) {
  return (
    <div className={cn('h-1.5 overflow-hidden rounded-full', hasCover ? 'bg-white/20' : 'bg-emerald-900/10')}>
      <motionlessProgressFill hasCover={hasCover} isEmpty={isEmpty} pct={pct} />
    </div>
  );
}

function motionlessProgressFill({
  hasCover,
  isEmpty,
  pct,
}: {
  hasCover: boolean;
  isEmpty: boolean;
  pct: number;
}) {
  return (
    <div
      className="h-full rounded-full transition-all duration-500"
      style={{
        width: `${isEmpty ? 0 : pct}%`,
        background: hasCover
          ? 'linear-gradient(90deg, rgba(255,255,255,0.95), rgba(167,243,208,0.95))'
          : 'linear-gradient(90deg, #047857, #34d399)',
      }}
    />
  );
}
